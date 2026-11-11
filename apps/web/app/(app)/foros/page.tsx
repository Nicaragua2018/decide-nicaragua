import Link from 'next/link';
import type { Metadata } from 'next';
import { serverFetch } from '@/lib/api';
import { GENERAL_GROUP_NAME } from '@decide/shared';
import type { ForumSummary } from '@decide/shared';
import { NewForumForm } from './NewForumForm';

export const metadata: Metadata = { title: 'Foros' };

export default async function ForosPage() {
  const [forumsRes, boardRes] = await Promise.all([
    serverFetch('/api/forums'),
    serverFetch('/api/board/me'),
  ]);
  const forums = forumsRes.ok ? ((await forumsRes.json()) as ForumSummary[]) : [];
  const role = boardRes.ok ? ((await boardRes.json()) as { role: string | null }).role : null;

  const byGroup = new Map<string, { groupId: string; groupName: string; forums: ForumSummary[] }>();
  for (const f of forums) {
    const entry = byGroup.get(f.groupId) ?? { groupId: f.groupId, groupName: f.groupName, forums: [] };
    entry.forums.push(f);
    byGroup.set(f.groupId, entry);
  }
  const GENERAL = GENERAL_GROUP_NAME;
  const groups = [...byGroup.values()].sort((a, b) => {
    if (a.groupName === GENERAL) return -1;
    if (b.groupName === GENERAL) return 1;
    return a.groupName.localeCompare(b.groupName, 'es');
  });

  return (
    <>
      <div className="dash-welcome">
        <div>
          <h1 className="page-title">Foros</h1>
          <p className="page-sub">
            Conversa con tu comunidad de origen, con quienes viven donde tú y con todo el exilio y la diáspora.
          </p>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="empty-card">
          <p className="empty-card-title">Aún no hay foros disponibles</p>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.groupId} className="mb-4">
            <div className="dash-section-header">
              <h2 className="dash-section-title">{g.groupName}</h2>
              <span className="dash-section-count">{g.forums.length}</span>
            </div>
            <div className="group-grid">
              {g.forums.map((f) => (
                <Link key={f.id} href={`/foros/${f.id}`} className="group-card">
                  <h3 className="group-card-name">{f.title}</h3>
                  {f.description && <p className="group-card-desc">{f.description}</p>}
                  <div className="group-card-footer">
                    <span className="group-card-members">
                      {f.topicCount} tema{f.topicCount !== 1 ? 's' : ''}
                    </span>
                    <span className="group-card-cta">Entrar →</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))
      )}

      {role && (
        <div className="card mt-4">
          <p className="card-title mb-3">Crear un foro</p>
          <NewForumForm
            communities={groups.map((g) => ({ groupId: g.groupId, groupName: g.groupName }))}
          />
        </div>
      )}
    </>
  );
}
