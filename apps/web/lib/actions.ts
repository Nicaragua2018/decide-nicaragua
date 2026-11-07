'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { RevisionTexto, TipoTexto } from '@decide/shared';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

/**
 * `revision`: el asistente dice que el texto no se puede publicar así (nivel 2).
 * `enRevision`: el texto quedó en revisión de la mesa (no se publicó todavía).
 */
export type ActionResult =
  | { error: string }
  | { success: true; devInviteUrl?: string; estado?: string }
  | { revision: RevisionTexto }
  | { enRevision: true };

async function actionFetch(path: string, init?: RequestInit): Promise<Response> {
  const cookieStore = await cookies();
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieStore.toString(),
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
}

async function parseError(res: Response): Promise<string> {
  try {
    const body = await res.json() as { message?: string | string[] };
    if (Array.isArray(body.message)) return body.message.join(', ');
    return body.message ?? `Error ${res.status.toString()}`;
  } catch {
    return `Error ${res.status.toString()}`;
  }
}

/** Un 422 «nivel_2» o un 202 «en_revision» de la API no son errores: la web los muestra aparte. */
async function respuestaDeRevision(res: Response): Promise<{ revision: RevisionTexto } | { enRevision: true } | null> {
  if (res.status === 202) return { enRevision: true };
  if (res.status === 422) {
    try {
      const body = (await res.clone().json()) as { codigo?: string; revision?: RevisionTexto };
      if (body.codigo === 'nivel_2' && body.revision) return { revision: body.revision };
    } catch {
      // sin cuerpo legible: se trata como error normal
    }
  }
  return null;
}

/** El formulario pide la revisión de la mesa (botón «Pedir revisión a la mesa»). */
function pedirRevision(formData: FormData): { pedirRevision?: true } {
  return formData.get('pedirRevision') === '1' ? { pedirRevision: true } : {};
}

/** Revisión previa del asistente. Si falla o no responde, no bloquea: devuelve `revisado: false`. */
export async function revisarTexto(tipo: TipoTexto, texto: string): Promise<RevisionTexto> {
  try {
    const res = await actionFetch('/api/asistente/revisar', {
      method: 'POST',
      body: JSON.stringify({ tipo, texto }),
    });
    if (!res.ok) return { nivel: 0, revisado: false };
    return (await res.json()) as RevisionTexto;
  } catch {
    return { nivel: 0, revisado: false };
  }
}

export async function firmarRevision(id: string, aprobar: boolean): Promise<ActionResult> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: 'Solicitud no válida.' };
  const res = await actionFetch(`/api/asistente/revisiones/${id}/firmar`, {
    method: 'POST',
    body: JSON.stringify({ aprobar }),
  });
  if (!res.ok) return { error: await parseError(res) };
  revalidatePath('/admin/mesa');
  return { success: true };
}

// ─── Proposals ────────────────────────────────────────────────────────────────

export async function createProposal(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const groupId = formData.get('groupId') as string;
  const res = await actionFetch(`/api/deliberation/groups/${groupId}/proposals`, {
    method: 'POST',
    body: JSON.stringify({
      title:       formData.get('title'),
      body:        formData.get('body'),
      status:      formData.get('status') ?? 'draft',
      ...pedirRevision(formData),
    }),
  });

  const rev = await respuestaDeRevision(res);
  if (rev) return rev;
  if (!res.ok) return { error: await parseError(res) };
  const data = await res.json() as { id: string };
  redirect(`/proposals/${data.id}`);
}

export async function updateProposalStatus(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const proposalId = formData.get('proposalId') as string;
  const status     = formData.get('status') as string;

  const res = await actionFetch(`/api/deliberation/proposals/${proposalId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });

  if (!res.ok) return { error: await parseError(res) };
  revalidatePath(`/proposals/${proposalId}`);
  return { success: true };
}

export async function createComment(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const proposalId = formData.get('proposalId') as string;
  const res = await actionFetch(`/api/deliberation/proposals/${proposalId}/comments`, {
    method: 'POST',
    body: JSON.stringify({
      body:     formData.get('body'),
      parentId: formData.get('parentId') || undefined,
      ...pedirRevision(formData),
    }),
  });

  const rev = await respuestaDeRevision(res);
  if (rev) return rev;
  if (!res.ok) return { error: await parseError(res) };
  revalidatePath(`/proposals/${proposalId}`);
  return { success: true };
}

export async function setSignal(proposalId: string, signal: string): Promise<void> {
  await actionFetch(`/api/deliberation/proposals/${proposalId}/signal`, {
    method: 'PUT',
    body: JSON.stringify({ signal }),
  });
  revalidatePath(`/proposals/${proposalId}`);
}

// ─── Elections ────────────────────────────────────────────────────────────────

export async function createElection(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const groupId = formData.get('groupId') as string;

  // Construir candidatos: candidate_title_0, candidate_title_1, ...
  const candidates: Array<{ title: string; description?: string; position: number }> = [];
  let i = 0;
  while (formData.has(`candidate_title_${i.toString()}`)) {
    const title = formData.get(`candidate_title_${i.toString()}`) as string;
    const desc  = formData.get(`candidate_description_${i.toString()}`) as string | null;
    if (title.trim()) {
      const trimmedDesc = desc?.trim();
      const entry: { title: string; description?: string; position: number } = {
        title: title.trim(),
        position: i + 1,
      };
      if (trimmedDesc) entry.description = trimmedDesc;
      candidates.push(entry);
    }
    i++;
  }

  if (candidates.length < 2) {
    return { error: 'Se requieren al menos 2 candidatos.' };
  }

  const res = await actionFetch(`/api/voting/groups/${groupId}/elections`, {
    method: 'POST',
    body: JSON.stringify({
      title:       formData.get('title'),
      description: formData.get('description') || undefined,
      startsAt:    formData.get('startsAt'),
      endsAt:      formData.get('endsAt'),
      candidates,
    }),
  });

  if (!res.ok) return { error: await parseError(res) };
  const data = await res.json() as { id: string };
  redirect(`/elections/${data.id}`);
}

export async function updateElectionStatus(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const electionId = formData.get('electionId') as string;
  const status     = formData.get('status') as string;

  const res = await actionFetch(`/api/voting/elections/${electionId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });

  if (!res.ok) return { error: await parseError(res) };
  revalidatePath(`/elections/${electionId}`);
  return { success: true };
}

export async function castVote(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const electionId = formData.get('electionId') as string;

  const rankings: Array<{ candidateId: string; rank: number }> = [];
  for (const [key, value] of formData.entries()) {
    if (key.startsWith('rank_') && value) {
      rankings.push({
        candidateId: key.replace('rank_', ''),
        rank: Number(value),
      });
    }
  }

  const res = await actionFetch(`/api/voting/elections/${electionId}/ballots`, {
    method: 'POST',
    body: JSON.stringify({ rankings }),
  });

  if (!res.ok) return { error: await parseError(res) };
  revalidatePath(`/elections/${electionId}`);
  return { success: true };
}

export async function tallyElection(electionId: string): Promise<void> {
  await actionFetch(`/api/voting/elections/${electionId}/tally`, { method: 'POST' });
  revalidatePath(`/elections/${electionId}`);
}

// ─── Sortition ────────────────────────────────────────────────────────────────

export async function createDraw(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const groupId = formData.get('groupId') as string;
  const res = await actionFetch(`/api/sortition/groups/${groupId}/draws`, {
    method: 'POST',
    body: JSON.stringify({
      title:         formData.get('title'),
      description:   formData.get('description') || undefined,
      selectionSize: Number(formData.get('selectionSize')),
    }),
  });

  if (!res.ok) return { error: await parseError(res) };
  const data = await res.json() as { id: string };
  redirect(`/sortition/${data.id}`);
}

export async function executeDraw(drawId: string): Promise<void> {
  await actionFetch(`/api/sortition/draws/${drawId}/execute`, { method: 'POST' });
  revalidatePath(`/sortition/${drawId}`);
}

export async function cancelDraw(drawId: string): Promise<void> {
  await actionFetch(`/api/sortition/draws/${drawId}/cancel`, { method: 'PATCH' });
  revalidatePath(`/sortition/${drawId}`);
}

// ─── Form wrappers (para form.action directo, sin useActionState) ─────────────
// Next.js espera (formData: FormData) => void | Promise<void> en form.action.
// Los wrappers descartan el valor de retorno para cumplir esa firma.

export async function updateProposalStatusDirect(formData: FormData): Promise<void> {
  await updateProposalStatus(null, formData);
}

export async function updateElectionStatusDirect(formData: FormData): Promise<void> {
  await updateElectionStatus(null, formData);
}

// ─── Newsletter ───────────────────────────────────────────────────────────────

export async function subscribeNewsletter(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const email   = (formData.get('email') as string | null)?.trim().toLowerCase();
  const name    = (formData.get('name') as string | null)?.trim() || undefined;
  const country = (formData.get('country') as string | null)?.trim().toUpperCase() || undefined;

  if (!email) return { error: 'Ingresa tu correo electrónico.' };

  // Reenviar la IP real del cliente al API para que el rate limiter opere por usuario,
  // no por la IP compartida del contenedor web
  const { headers: nextHeaders } = await import('next/headers');
  const headerStore = await nextHeaders();
  const clientIp = headerStore.get('x-forwarded-for') ?? headerStore.get('x-real-ip') ?? '';

  const res = await fetch(`${API_URL}/api/newsletter/subscribe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(clientIp ? { 'x-forwarded-for': clientIp } : {}),
    },
    body: JSON.stringify({ email, name, country }),
  });

  if (res.status === 409) return { error: 'Este correo ya está suscrito.' };
  if (!res.ok) return { error: await parseError(res) };
  return { success: true };
}

// ─── Admin ────────────────────────────────────────────────────────────────────

export async function inviteUser(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const res = await actionFetch('/api/auth/invite', {
    method: 'POST',
    body: JSON.stringify({ email: formData.get('email') }),
  });

  if (!res.ok) return { error: await parseError(res) };
  const data = await res.json() as { devInviteUrl?: string };
  return { success: true, ...(data.devInviteUrl ? { devInviteUrl: data.devInviteUrl } : {}) };
}

export async function updateUserStatus(
  userId: string,
  status: string,
): Promise<ActionResult> {
  const res = await actionFetch(`/api/users/${userId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });

  if (!res.ok) return { error: await parseError(res) };
  revalidatePath('/admin/users');
  return { success: true };
}

// ─── Verificación y mesa ──────────────────────────────────────────────────────

export async function confirmReference(userId: string): Promise<ActionResult> {
  const res = await actionFetch(`/api/verifications/${userId}/confirm`, { method: 'POST' });
  if (!res.ok) return { error: await parseError(res) };
  revalidatePath('/verificaciones');
  return { success: true };
}

export async function assignSeat(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const res = await actionFetch('/api/board/seats', {
    method: 'POST',
    body: JSON.stringify({ role: formData.get('role'), profileId: formData.get('profileId') }),
  });
  if (!res.ok) return { error: await parseError(res) };
  revalidatePath('/admin/mesa');
  return { success: true };
}

export async function proposeBoardAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const type = formData.get('type');
  const params = type === 'change_origin' ? { birthDepartment: formData.get('birthDepartment') } : {};
  const res = await actionFetch('/api/board/actions', {
    method: 'POST',
    body: JSON.stringify({ type, targetUserId: formData.get('targetUserId'), reason: formData.get('reason'), params }),
  });
  if (!res.ok) return { error: await parseError(res) };
  revalidatePath('/admin/mesa');
  return { success: true };
}

export async function voteBoardAction(actionId: string, approve: boolean): Promise<ActionResult> {
  const res = await actionFetch(`/api/board/actions/${actionId}/vote`, {
    method: 'POST',
    body: JSON.stringify({ approve }),
  });
  if (!res.ok) return { error: await parseError(res) };
  revalidatePath('/admin/mesa');
  return { success: true };
}

// ─── Foros ────────────────────────────────────────────────────────────────────

export async function createForum(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const res = await actionFetch('/api/forums', {
    method: 'POST',
    body: JSON.stringify({
      groupId: formData.get('groupId'),
      title: formData.get('title'),
      description: formData.get('description') || undefined,
    }),
  });
  if (!res.ok) return { error: await parseError(res) };
  revalidatePath('/foros');
  return { success: true };
}

export async function createTopic(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const groupId = String(formData.get('groupId'));
  const forumId = String(formData.get('forumId'));
  const res = await actionFetch(`/api/deliberation/groups/${groupId}/proposals`, {
    method: 'POST',
    body: JSON.stringify({ title: formData.get('title'), body: formData.get('body'), forumId, ...pedirRevision(formData) }),
  });
  const rev = await respuestaDeRevision(res);
  if (rev) return rev;
  if (!res.ok) return { error: await parseError(res) };
  revalidatePath(`/foros/${forumId}`);
  return { success: true };
}

export async function formalizeTopic(topicId: string): Promise<ActionResult> {
  const res = await actionFetch(`/api/forums/topics/${topicId}/formalize`, { method: 'POST' });
  if (!res.ok) return { error: await parseError(res) };
  revalidatePath(`/proposals/${topicId}`);
  return { success: true };
}

export async function closeTopic(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const topicId = String(formData.get('topicId'));
  const res = await actionFetch(`/api/forums/topics/${topicId}/close`, {
    method: 'POST',
    body: JSON.stringify({ conclusion: formData.get('conclusion'), objections: formData.get('objections') || undefined }),
  });
  if (!res.ok) return { error: await parseError(res) };
  revalidatePath(`/proposals/${topicId}`);
  return { success: true };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);
const INVALID: ActionResult = { error: 'Solicitud no válida.' };

/** Refresca la pantalla del contenido moderado: un tema o una inquietud. */
function revalidateContent(formData: FormData): void {
  const topicId = formData.get('topicId');
  const inquietudId = formData.get('inquietudId');
  const grupoId = formData.get('grupoId');
  if (isUuid(grupoId)) revalidatePath(`/grupos/${grupoId}`);
  if (isUuid(topicId)) revalidatePath(`/proposals/${topicId}`);
  if (isUuid(inquietudId)) {
    revalidatePath(`/inquietudes/${inquietudId}`);
    revalidatePath('/inquietudes');
  }
}

export async function hideContent(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const targetId = formData.get('targetId');
  if (!isUuid(targetId)) return INVALID;
  const detalle = formData.get('reason');
  const res = await actionFetch('/api/forums/moderation/hide', {
    method: 'POST',
    body: JSON.stringify({
      target: formData.get('target'),
      targetId,
      causa: formData.get('causa'),
      ...(typeof detalle === 'string' && detalle.trim() !== '' ? { reason: detalle.trim() } : {}),
    }),
  });
  if (!res.ok) return { error: await parseError(res) };
  const body = (await res.json().catch(() => ({}))) as { estado?: string };
  revalidateContent(formData);
  return body.estado ? { success: true, estado: body.estado } : { success: true };
}

export async function confirmarModeracion(moderationId: string, aprobar: boolean): Promise<ActionResult> {
  if (!isUuid(moderationId)) return INVALID;
  const res = await actionFetch(`/api/forums/moderation/${moderationId}/confirmar`, {
    method: 'POST',
    body: JSON.stringify({ aprobar }),
  });
  if (!res.ok) return { error: await parseError(res) };
  revalidatePath('/admin/mesa');
  // Confirmar oculta y rechazar puede volver a mostrar: se refrescan las páginas con contenido
  // (temas, propuestas, inquietudes, decisiones), que cuelgan del layout raíz.
  revalidatePath('/', 'layout');
  return { success: true };
}

export async function appealModeration(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  if (!isUuid(formData.get('moderationId'))) return INVALID;
  const res = await actionFetch(`/api/forums/moderation/${String(formData.get('moderationId'))}/appeal`, {
    method: 'POST',
    body: JSON.stringify({ text: formData.get('text') }),
  });
  if (!res.ok) return { error: await parseError(res) };
  revalidateContent(formData);
  return { success: true };
}

export async function resolveAppeal(moderationId: string, restore: boolean): Promise<ActionResult> {
  const res = await actionFetch(`/api/forums/moderation/${moderationId}/resolve`, {
    method: 'POST',
    body: JSON.stringify({ restore }),
  });
  if (!res.ok) return { error: await parseError(res) };
  revalidatePath('/admin/mesa');
  return { success: true };
}

// ─── Inquietudes y reglas ─────────────────────────────────────────────────────

export async function createInquietud(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const groupId = formData.get('groupId');
  if (!isUuid(groupId)) return INVALID;
  const res = await actionFetch('/api/inquietudes', {
    method: 'POST',
    body: JSON.stringify({ groupId, title: formData.get('title'), body: formData.get('body'), ...pedirRevision(formData) }),
  });
  const rev = await respuestaDeRevision(res);
  if (rev) return rev;
  if (!res.ok) return { error: await parseError(res) };
  revalidatePath('/inquietudes');
  return { success: true };
}

export async function supportInquietud(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return INVALID;
  const res = await actionFetch(`/api/inquietudes/${id}/apoyo`, { method: 'POST' });
  if (!res.ok) return { error: await parseError(res) };
  revalidatePath('/inquietudes');
  revalidatePath(`/inquietudes/${id}`);
  return { success: true };
}

export async function unsupportInquietud(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return INVALID;
  const res = await actionFetch(`/api/inquietudes/${id}/apoyo`, { method: 'DELETE' });
  if (!res.ok) return { error: await parseError(res) };
  revalidatePath('/inquietudes');
  revalidatePath(`/inquietudes/${id}`);
  return { success: true };
}

export async function openDebate(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const groupId = formData.get('groupId');
  const inquietudIds = formData.getAll('inquietudIds').map(String);
  if (!isUuid(groupId) || inquietudIds.length === 0 || !inquietudIds.every(isUuid)) return INVALID;
  const res = await actionFetch('/api/inquietudes/debates', {
    method: 'POST',
    body: JSON.stringify({
      groupId,
      inquietudIds,
      title: formData.get('title'),
      body: formData.get('body'),
      ...pedirRevision(formData),
    }),
  });
  const rev = await respuestaDeRevision(res);
  if (rev) return rev;
  if (!res.ok) return { error: await parseError(res) };
  const data = (await res.json()) as { proposalId: string };
  revalidatePath('/inquietudes');
  revalidatePath('/inquietudes/agenda');
  redirect(`/proposals/${data.proposalId}`);
}

export async function respondInquietud(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const id = formData.get('inquietudId');
  if (!isUuid(id)) return INVALID;
  const res = await actionFetch(`/api/inquietudes/${id}/respuesta`, {
    method: 'POST',
    body: JSON.stringify({ text: formData.get('text'), ...pedirRevision(formData) }),
  });
  const rev = await respuestaDeRevision(res);
  if (rev) return rev;
  if (!res.ok) return { error: await parseError(res) };
  revalidatePath(`/inquietudes/${id}`);
  revalidatePath('/inquietudes');
  revalidatePath('/inquietudes/agenda');
  return { success: true };
}

// ─── Frases y mapa de opiniones ───────────────────────────────────────────────

export async function createFrase(
  proposalId: string,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!isUuid(proposalId)) return INVALID;
  const res = await actionFetch(`/api/frases/temas/${proposalId}`, {
    method: 'POST',
    body: JSON.stringify({ text: formData.get('text'), ...pedirRevision(formData) }),
  });
  const rev = await respuestaDeRevision(res);
  if (rev) return rev;
  if (!res.ok) return { error: await parseError(res) };
  revalidatePath(`/proposals/${proposalId}`);
  return { success: true };
}

export async function voteFrase(
  fraseId: string,
  value: string,
  proposalId: string,
): Promise<ActionResult> {
  if (!isUuid(fraseId) || !isUuid(proposalId)) return INVALID;
  if (value !== 'de_acuerdo' && value !== 'en_desacuerdo' && value !== 'paso') return INVALID;
  const res = await actionFetch(`/api/frases/${fraseId}/voto`, {
    method: 'PUT',
    body: JSON.stringify({ value }),
  });
  if (!res.ok) return { error: await parseError(res) };
  revalidatePath(`/proposals/${proposalId}`);
  return { success: true };
}

// ─── Soluciones y decisión ────────────────────────────────────────────────────

export async function createSolucion(
  proposalId: string,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!isUuid(proposalId)) return INVALID;
  const res = await actionFetch(`/api/decisiones/temas/${proposalId}/soluciones`, {
    method: 'POST',
    body: JSON.stringify({ title: formData.get('title'), description: formData.get('description'), ...pedirRevision(formData) }),
  });
  const rev = await respuestaDeRevision(res);
  if (rev) return rev;
  if (!res.ok) return { error: await parseError(res) };
  revalidatePath(`/proposals/${proposalId}`);
  return { success: true };
}

export async function mergeSolucion(
  solucionId: string,
  intoId: string,
  proposalId: string,
): Promise<ActionResult> {
  if (!isUuid(solucionId) || !isUuid(intoId) || !isUuid(proposalId)) return INVALID;
  const res = await actionFetch(`/api/decisiones/soluciones/${solucionId}/juntar`, {
    method: 'POST',
    body: JSON.stringify({ intoId }),
  });
  if (!res.ok) return { error: await parseError(res) };
  revalidatePath(`/proposals/${proposalId}`);
  return { success: true };
}

export async function proposeModo(proposalId: string, modo: string): Promise<ActionResult> {
  if (!isUuid(proposalId)) return INVALID;
  if (modo !== 'excluyentes' && modo !== 'compatibles') return INVALID;
  const res = await actionFetch(`/api/decisiones/temas/${proposalId}/modo`, {
    method: 'POST',
    body: JSON.stringify({ modo }),
  });
  if (!res.ok) return { error: await parseError(res) };
  revalidatePath(`/proposals/${proposalId}`);
  return { success: true };
}

export async function setObjecion(proposalId: string, objeto: boolean): Promise<ActionResult> {
  if (!isUuid(proposalId) || typeof objeto !== 'boolean') return INVALID;
  const res = await actionFetch(`/api/decisiones/temas/${proposalId}/objecion`, {
    method: 'PUT',
    body: JSON.stringify({ objeto }),
  });
  if (!res.ok) return { error: await parseError(res) };
  revalidatePath(`/proposals/${proposalId}`);
  return { success: true };
}

export async function castPapeleta(
  proposalId: string,
  abstencion: boolean,
  orden: string[],
): Promise<ActionResult> {
  if (!isUuid(proposalId) || typeof abstencion !== 'boolean') return INVALID;
  if (!Array.isArray(orden) || !orden.every(isUuid)) return INVALID;
  const res = await actionFetch(`/api/decisiones/temas/${proposalId}/papeleta`, {
    method: 'PUT',
    body: JSON.stringify({ abstencion, orden }),
  });
  if (!res.ok) return { error: await parseError(res) };
  revalidatePath(`/proposals/${proposalId}`);
  return { success: true };
}

// ─── Grupos de trabajo ────────────────────────────────────────────────────────

export async function proponerGrupo(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const ambitoId = formData.get('ambitoId');
  if (!isUuid(ambitoId)) return { error: 'Elige una comunidad.' };
  const res = await actionFetch('/api/grupos', {
    method: 'POST',
    body: JSON.stringify({ ambitoId, name: formData.get('name'), proposito: formData.get('proposito'), ...pedirRevision(formData) }),
  });
  const rev = await respuestaDeRevision(res);
  if (rev) return rev;
  if (!res.ok) return { error: await parseError(res) };
  revalidatePath('/grupos');
  revalidatePath('/decisiones');
  return { success: true };
}

/** Entra o sale de un grupo de trabajo. */
export async function cambiarMembresiaGrupo(grupoId: string, accion: 'entrar' | 'salir'): Promise<ActionResult> {
  if (!isUuid(grupoId) || (accion !== 'entrar' && accion !== 'salir')) return INVALID;
  const res = await actionFetch(`/api/grupos/${grupoId}/${accion}`, { method: 'POST' });
  if (!res.ok) return { error: await parseError(res) };
  // La pertenencia cambia lo que se ve en grupos, temas y decisiones.
  revalidatePath('/', 'layout');
  return { success: true };
}

export async function llevarALaComunidad(grupoId: string, solucionId: string): Promise<ActionResult> {
  if (!isUuid(grupoId) || !isUuid(solucionId)) return INVALID;
  const res = await actionFetch(`/api/grupos/${grupoId}/llevar`, {
    method: 'POST',
    body: JSON.stringify({ solucionId }),
  });
  if (!res.ok) return { error: await parseError(res) };
  const data = (await res.json()) as { inquietudId: string };
  revalidatePath('/inquietudes');
  redirect(`/inquietudes/${data.inquietudId}`);
}

// ─── Comisiones y bifurcaciones ───────────────────────────────────────────────

function revalidarGrupo(grupoId: string): void {
  revalidatePath(`/grupos/${grupoId}`);
  revalidatePath('/grupos');
  revalidatePath('/decisiones');
}

/** Ofrecerse como voluntario de una comisión o retirarse. */
export async function ofrecerseComision(grupoId: string, experiencia: string): Promise<ActionResult> {
  if (!isUuid(grupoId)) return INVALID;
  const res = await actionFetch(`/api/grupos/${grupoId}/voluntario`, {
    method: 'POST',
    body: JSON.stringify(experiencia.trim() === '' ? {} : { experiencia }),
  });
  if (!res.ok) return { error: await parseError(res) };
  revalidarGrupo(grupoId);
  return { success: true };
}

export async function retirarseComision(grupoId: string): Promise<ActionResult> {
  if (!isUuid(grupoId)) return INVALID;
  const res = await actionFetch(`/api/grupos/${grupoId}/voluntario`, { method: 'DELETE' });
  if (!res.ok) return { error: await parseError(res) };
  revalidarGrupo(grupoId);
  return { success: true };
}

export async function ajustarComision(grupoId: string, tarea: string, puestos: number): Promise<ActionResult> {
  if (!isUuid(grupoId) || !Number.isInteger(puestos)) return INVALID;
  const res = await actionFetch(`/api/grupos/${grupoId}/comision`, {
    method: 'PATCH',
    body: JSON.stringify({ tarea, puestos }),
  });
  if (!res.ok) return { error: await parseError(res) };
  revalidarGrupo(grupoId);
  return { success: true };
}

export async function guardarPapeletaComision(grupoId: string, orden: string[]): Promise<ActionResult> {
  if (!isUuid(grupoId) || !orden.every(isUuid)) return INVALID;
  const res = await actionFetch(`/api/grupos/${grupoId}/comision/papeleta`, {
    method: 'PUT',
    body: JSON.stringify({ orden }),
  });
  if (!res.ok) return { error: await parseError(res) };
  revalidarGrupo(grupoId);
  return { success: true };
}

export async function publicarInforme(
  grupoId: string,
  texto: string,
  final: boolean,
  pedir = false,
): Promise<ActionResult> {
  if (!isUuid(grupoId)) return INVALID;
  const res = await actionFetch(`/api/grupos/${grupoId}/informes`, {
    method: 'POST',
    body: JSON.stringify({ texto, final, ...(pedir ? { pedirRevision: true } : {}) }),
  });
  const rev = await respuestaDeRevision(res);
  if (rev) return rev;
  if (!res.ok) return { error: await parseError(res) };
  revalidarGrupo(grupoId);
  return { success: true };
}

export async function apoyarRenovacion(grupoId: string, apoyar: boolean): Promise<ActionResult> {
  if (!isUuid(grupoId)) return INVALID;
  const res = await actionFetch(`/api/grupos/${grupoId}/renovacion`, { method: apoyar ? 'POST' : 'DELETE' });
  if (!res.ok) return { error: await parseError(res) };
  revalidarGrupo(grupoId);
  return { success: true };
}

export async function verificarSorteo(grupoId: string): Promise<{ ok: boolean; elegidos: number } | { error: string }> {
  if (!isUuid(grupoId)) return { error: 'Solicitud no válida.' };
  const res = await actionFetch(`/api/grupos/${grupoId}/comision/verificar`);
  if (!res.ok) return { error: await parseError(res) };
  const body = (await res.json()) as { ok: boolean; elegidos: string[] };
  return { ok: body.ok, elegidos: body.elegidos.length };
}

/** Inicia (o se suma a) la bifurcación de una solución perdedora y lleva a su grupo. */
export async function iniciarBifurcacion(solucionId: string): Promise<ActionResult> {
  if (!isUuid(solucionId)) return INVALID;
  const res = await actionFetch('/api/grupos/bifurcaciones', {
    method: 'POST',
    body: JSON.stringify({ solucionId }),
  });
  if (!res.ok) return { error: await parseError(res) };
  const data = (await res.json()) as { id: string };
  revalidatePath('/grupos');
  revalidatePath('/decisiones');
  redirect(`/grupos/${data.id}`);
}

/**
 * Sumarse a una iniciativa de un grupo que ya existe, desde el resultado de la decisión: quien la
 * apoyó todavía no la puede leer, así que no se refresca la página; al entrar se va a la iniciativa.
 */
export async function sumarmeAIniciativa(grupoId: string): Promise<ActionResult> {
  if (!isUuid(grupoId)) return INVALID;
  const res = await actionFetch(`/api/grupos/${grupoId}/entrar`, { method: 'POST' });
  if (!res.ok) return { error: await parseError(res) };
  revalidarGrupo(grupoId);
  redirect(`/grupos/${grupoId}`);
}

export async function pausarBifurcacion(grupoId: string, causa: string, detalle: string): Promise<ActionResult> {
  if (!isUuid(grupoId)) return INVALID;
  const res = await actionFetch(`/api/grupos/${grupoId}/pausa`, {
    method: 'POST',
    body: JSON.stringify({ causa, ...(detalle.trim() !== '' ? { detalle: detalle.trim() } : {}) }),
  });
  if (!res.ok) return { error: await parseError(res) };
  revalidarGrupo(grupoId);
  return { success: true };
}

export async function apelarPausa(grupoId: string, texto: string): Promise<ActionResult> {
  if (!isUuid(grupoId)) return INVALID;
  const res = await actionFetch(`/api/grupos/${grupoId}/pausa/apelacion`, {
    method: 'POST',
    body: JSON.stringify({ texto }),
  });
  if (!res.ok) return { error: await parseError(res) };
  revalidarGrupo(grupoId);
  return { success: true };
}

export async function resolverPausa(grupoId: string, reanudar: boolean): Promise<ActionResult> {
  if (!isUuid(grupoId)) return INVALID;
  const res = await actionFetch(`/api/grupos/${grupoId}/pausa/resolver`, {
    method: 'POST',
    body: JSON.stringify({ reanudar }),
  });
  if (!res.ok) return { error: await parseError(res) };
  revalidarGrupo(grupoId);
  revalidatePath('/admin/mesa');
  return { success: true };
}

/** Un miembro de la bifurcación pide su comisión y va a ella. */
export async function pedirComision(grupoId: string): Promise<ActionResult> {
  if (!isUuid(grupoId)) return INVALID;
  const res = await actionFetch(`/api/grupos/${grupoId}/comision`, { method: 'POST' });
  if (!res.ok) return { error: await parseError(res) };
  const data = (await res.json()) as { id: string };
  revalidarGrupo(grupoId);
  redirect(`/grupos/${data.id}`);
}

/** Propone cambiar una regla. Abre un debate y, al terminar, la comunidad vota. */
export async function proponerCambioRegla(
  groupId: string,
  key: string,
  valor: string,
  motivo?: string,
  pedir = false,
): Promise<{ error: string } | { success: true; proposalId: string } | { revision: RevisionTexto } | { enRevision: true }> {
  if (!isUuid(groupId)) return { error: 'Solicitud no válida.' };
  const res = await actionFetch('/api/rules/cambios', {
    method: 'POST',
    body: JSON.stringify({ groupId, key, valor, ...(motivo ? { motivo } : {}), ...(pedir ? { pedirRevision: true } : {}) }),
  });
  const rev = await respuestaDeRevision(res);
  if (rev) return rev;
  if (!res.ok) return { error: await parseError(res) };
  const data = (await res.json()) as { id: string; proposalId: string };
  revalidatePath('/reglas');
  return { success: true, proposalId: data.proposalId };
}
