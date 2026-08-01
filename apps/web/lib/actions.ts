'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

export type ActionResult = { error: string } | { success: true; devInviteUrl?: string };

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
    }),
  });

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
    }),
  });

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

export async function createCommentDirect(formData: FormData): Promise<void> {
  await createComment(null, formData);
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
