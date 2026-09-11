-- B5B harness — final report. Emitted as the LAST statement so the runner receives it
-- as the result set. The runner always ROLLs BACK after this.
--
-- Returned as a SINGLE json column so the result survives both execution modes
-- unchanged: psql `-t -A` prints it as one line (the report's embedded newlines are
-- JSON-escaped, so the runner can find it by scanning for the last line that parses),
-- and the Management API returns it as rows[0].b5b.
-- `failures` is emitted SEPARATELY and re-printed by the runner at the very END of
-- its output. `report` is ~1800 lines, and a CI log viewer truncates a long step —
-- which it did, from the front, hiding every failing assertion behind suites that
-- happened to run last. A failure nobody can read is a failure nobody can fix, and
-- the answer is not to shorten the report but to repeat the short part last.
select json_build_object(
  'failures', coalesce((
    select string_agg(format('FAIL [%s] %s :: expected=%s actual=%s',
                             suite, name, expected, actual), chr(10) order by id)
      from _results where not pass), ''),
  'report', coalesce(string_agg(
    format('%s [%s] %s :: expected=%s actual=%s',
           case when pass then 'PASS' else 'FAIL' end, suite, name, expected, actual),
    chr(10) order by id), '(no assertions ran)'),
  'passed', count(*) filter (where pass),
  'failed', count(*) filter (where not pass),
  'total',  count(*)
) as b5b
from _results;
