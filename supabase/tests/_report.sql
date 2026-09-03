-- B5B harness — final report. Emitted as the LAST statement so the runner receives
-- it as the result set. The runner always ROLLs BACK after this.
select
  coalesce(string_agg(
    format('%s [%s] %s :: expected=%s actual=%s',
           case when pass then 'PASS' else 'FAIL' end, suite, name, expected, actual),
    chr(10) order by id), '(no assertions ran)') as report,
  count(*) filter (where pass)      as passed,
  count(*) filter (where not pass)  as failed,
  count(*)                          as total
from _results;
