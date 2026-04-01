'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

export type ActionResult = { error: string } | { success: true };

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
    if (title.trim()) {
      candidates.push({ title: title.trim(), position: i + 1 });
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

  const res = await actionFetch(`/api/voting/elections/${electionId}/vote`, {
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
  return { success: true };
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
