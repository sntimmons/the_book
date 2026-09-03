-- B5B harness — final report. Emitted as the LAST statement so the runner receives it
-- as the result set. The runner always ROLLs BACK after this.
--
-- Returned as a SINGLE json column so the result survives both execution modes
-- unchanged: psql `-t -A` prints it as one line (the report's embedded newlines are
-- JSON-escaped, so the runner can find it by scanning for the last line that parses),
-- and the Management API returns it as rows[0].b5b.
select json_build_object(
  'report', coalesce(string_agg(
    format('%s [%s] %s :: expected=%s actual=%s',
           case when pass then 'PASS' else 'FAIL' end, suite, name, expected, actual),
    chr(10) order by id), '(no assertions ran)'),
  'passed', count(*) filter (where pass),
  'failed', count(*) filter (where not pass),
  'total',  count(*)
) as b5b
from _results;
