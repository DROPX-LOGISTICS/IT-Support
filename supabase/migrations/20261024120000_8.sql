-- IT Support: branch-aware repository mappings. Only support_ objects. Safe to re-run.

alter table support_portal_repos add column if not exists git_ref text;

alter table support_portal_repos drop constraint if exists support_portal_repos_git_ref_check;
alter table support_portal_repos add constraint support_portal_repos_git_ref_check check (
  git_ref is null or (
    char_length(git_ref) between 1 and 255
    and git_ref = btrim(git_ref)
    and git_ref !~ '[[:space:][:cntrl:]]'
    and git_ref not like '/%'
    and git_ref not like '%/'
    and position('..' in git_ref) = 0
    and position('//' in git_ref) = 0
  )
);

create index if not exists support_portal_repos_source_idx
  on support_portal_repos (lower(repo), coalesce(git_ref, ''));
