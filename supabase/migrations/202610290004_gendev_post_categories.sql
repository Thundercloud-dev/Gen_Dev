alter table public.community_posts
  drop constraint if exists community_posts_post_type_check;

alter table public.community_posts
  add constraint community_posts_post_type_check
  check (post_type in ('clip','tip','project','video','discussion','defeat'));
