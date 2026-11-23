-- =====================================================================
-- AA Workbench P2c 되돌리기 (Sprint 9: 노트)
-- 원칙(Sprint 9 Q2·U2): 문제가 생기면 먼저 화면만 끈다. 이 파일은 노트가 하나도 없을 때만 테이블을 지운다.
-- 같은 트랜잭션에서 테이블을 잠가(access exclusive) 확인과 삭제 사이에 새 노트가 들어오지 못하게 한 뒤
-- 0건이면 지우고, 1건 이상이면 아무것도 바꾸지 않고 중단한다(노트가 있으면 테이블·API는 둔다).
-- P1·P2a·P2b 객체는 건드리지 않는다.
-- =====================================================================
begin;

lock table public.aa_notes in access exclusive mode;

do $$
declare n int;
begin
  select count(*) into n from public.aa_notes;
  if n > 0 then
    raise exception 'P2c 되돌리기 중단: 노트 %건이 있습니다. 화면만 끄고 테이블·API는 유지하세요.', n;
  end if;
end $$;

drop table if exists public.aa_notes;   -- 인덱스·트리거도 함께 삭제 (aa_touch_updated_at 함수는 P1 객체라 둔다)

commit;

notify pgrst, 'reload schema';
