import test from "node:test";
import assert from "node:assert/strict";
import { csvCell, csvToObjects, parseCsv, toCsv } from "./csv.ts";
import { dailyCsv, ticketsCsv, TICKET_HEADER } from "./export-columns.ts";

test("quotes cells that need it", () => {
  assert.equal(csvCell("plain"), "plain");
  assert.equal(csvCell("a,b"), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell("line1\nline2"), '"line1\nline2"');
  assert.equal(csvCell(null), "");
  assert.equal(csvCell(3.5), "3.5");
});
test("neutralises spreadsheet formulas", () => {
  for (const evil of ["=HYPERLINK(\"http://x\",\"y\")", "+1+1", "-2+3", "@SUM(A1)", "\t=1"]) assert.ok(csvCell(evil).replace(/^"/, "").startsWith("'"), evil);
  assert.equal(csvCell(-2), "-2");
  assert.equal(csvCell("2026-10-08"), "2026-10-08");
});
test("round trip through the reader, including new lines and quotes inside cells", () => {
  const csv = toCsv(["a", "b"], [["x,1", 'q"uote'], ["multi\nline", ""]]);
  assert.ok(csv.startsWith("\ufeff"));
  assert.deepEqual(parseCsv(csv), [["a", "b"], ["x,1", 'q"uote'], ["multi\nline", ""]]);
});
test("reader handles CRLF, blank lines and a missing final newline", () => {
  assert.deepEqual(parseCsv("a,b\r\n1,2\r\n\r\n3,4"), [["a", "b"], ["1", "2"], ["3", "4"]]);
  assert.deepEqual(csvToObjects("ID, Status\nBUG-1,New").rows, [{ ID: "BUG-1", Status: "New" }]);
});
test("ticket export has the sheet columns and never includes internal comments", () => {
  const row = { number: "BUG-001", type: "bug", portal: "People", title: "T", description: "D", steps: null, reporter_name: "Asha", raised_by_name: "Asha", raised_by_phone: null, priority: "P1", attachmentLinks: ["https://s/api/attachments/1"], status: "New", expected_date: null, developer_update: null, confirmed_working: "yes", viable: null, viable_reason: null, assignee: "", created_at: "2026-10-08T05:00:00Z", updated_at: "2026-10-08T05:00:00Z", closed_at: null };
  const [head, line] = parseCsv(ticketsCsv([row]));
  assert.deepEqual(head, TICKET_HEADER);
  assert.equal(line[head.indexOf("Does it work now?")], "Yes");
  assert.equal(line[head.indexOf("Raised on")], "2026-10-08 10:30");
  assert.ok(!head.some((h) => /internal|comment/i.test(h)));
});
test("daily export columns", () => {
  const [head, line] = parseCsv(dailyCsv([{ update_date: "2026-10-07", developer: "Ravi", portal: "People", ticket: "BUG-012", work_done: "Fixed.", hours: 3.5, status: "Done", blocker: null, next_step: null, target_date: null }]));
  assert.deepEqual(head.slice(0, 7), ["Date", "Developer", "Portal", "Related ID", "Work done", "Hours", "Status"]);
  assert.equal(line[5], "3.5");
});
