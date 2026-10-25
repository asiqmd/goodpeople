import {
  addDays,
  todayIn,
  type ProductionBatchResult,
  type ProductionDayView,
  type ProductionImportResult,
  type ProductionOperationView,
  type ProductionSummaryView,
} from '@gp/shared';
import type { INestApplication } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { randomUUID } from 'node:crypto';
import { line, payrollKit } from './payroll-helpers.js';
import { api, bearer, bootApp } from './test-env.js';

const workerOf = <T extends { employee: { id: string } }>(view: { workers: T[] }, id: string) =>
  view.workers.find((w) => w.employee.id === id);

// Each test makes its own operations, workers and pay groups, and uses its own month or days,
// so the tests pass in any order.
describe('production', () => {
  let app: INestApplication;
  let kit: Awaited<ReturnType<typeof payrollKit>>;

  beforeAll(async () => {
    app = await bootApp();
    kit = await payrollKit(app);
  });
  afterAll(() => app.close());

  const unit = (code: string) => kit.org.orgUnits.find((u) => u.code === code)!.id;
  const as = () => bearer(kit.admin);
  async function operation(fields: Record<string, unknown>) {
    return (
      await api(app)
        .post('/tenant/production/operations')
        .set(as())
        .send({ code: `op-${kit.unique()}`, name: 'Side seam', ...fields })
        .expect(201)
    ).body as ProductionOperationView;
  }
  const save = (body: Record<string, unknown>, status = 200) =>
    api(app).put('/tenant/production/entries').set(as()).send(body).expect(status);
  const day = async (date: string, unitCode: string) =>
    (
      await api(app)
        .get(`/tenant/production/day?date=${date}&orgUnitId=${unit(unitCode)}`)
        .set(as())
        .expect(200)
    ).body as ProductionDayView;
  const summary = async (month: string, unitCode?: string) =>
    (
      await api(app)
        .get(
          `/tenant/production/summary?month=${month}${unitCode ? `&orgUnitId=${unit(unitCode)}` : ''}`,
        )
        .set(as())
        .expect(200)
    ).body as ProductionSummaryView;
  const upload = (name: string, content: Buffer | string) =>
    api(app)
      .post('/tenant/production/import')
      .set(as())
      .attach('file', typeof content === 'string' ? Buffer.from(content) : content, name);

  it('keeps operations with unique codes and rates that pay something', async () => {
    const op = await operation({ pieceRate: '1.25', style: 'Polo 2210', nameBn: 'সাইড সেলাই' });
    expect(op).toMatchObject({
      code: expect.stringMatching(/^OP-/),
      pieceRate: '1.2500',
      dailyTarget: null,
      isActive: true,
    });
    const list = (await api(app).get('/tenant/production/operations').set(as()).expect(200))
      .body as ProductionOperationView[];
    expect(list.map((o) => o.id)).toContain(op.id);

    const taken = await api(app)
      .post('/tenant/production/operations')
      .set(as())
      .send({ code: op.code.toLowerCase(), name: 'Again', pieceRate: 1 })
      .expect(409);
    expect(taken.body.code).toBe('operation_code_taken');
    const issueOf = async (fields: Record<string, unknown>) =>
      (
        await api(app)
          .post('/tenant/production/operations')
          .set(as())
          .send({ code: `x-${kit.unique()}`, name: 'Bad rates', ...fields })
          .expect(400)
      ).body.issues[0].path;
    expect(await issueOf({})).toBe('pieceRate');
    expect(await issueOf({ dailyTarget: 100 })).toBe('incentiveRate');
    expect(await issueOf({ pieceRate: '1.23456' })).toBe('pieceRate');
    expect(await issueOf({ pieceRate: '-1' })).toBe('pieceRate');
    // A target with its incentive is enough on its own.
    const target = await operation({ dailyTarget: 120, incentiveRate: '0.75' });

    const changed = (
      await api(app)
        .patch(`/tenant/production/operations/${op.id}`)
        .set(as())
        .send({ pieceRate: '1.5', dailyTarget: 80, incentiveRate: '0.5' })
        .expect(200)
    ).body as ProductionOperationView;
    expect(changed).toMatchObject({ pieceRate: '1.5000', dailyTarget: 80, style: 'Polo 2210' });
    const stripped = await api(app)
      .patch(`/tenant/production/operations/${target.id}`)
      .set(as())
      .send({ incentiveRate: null })
      .expect(400);
    expect(stripped.body.issues[0].path).toBe('incentiveRate');
    await api(app)
      .patch(`/tenant/production/operations/${target.id}`)
      .set(as())
      .send({ code: op.code })
      .expect(409);

    const off = await api(app)
      .post(`/tenant/production/operations/${op.id}/deactivate`)
      .set(as())
      .expect(200);
    expect(off.body.isActive).toBe(false);
    const on = await api(app)
      .post(`/tenant/production/operations/${op.id}/activate`)
      .set(as())
      .expect(200);
    expect(on.body.isActive).toBe(true);
    await api(app)
      .post(`/tenant/production/operations/${randomUUID()}/deactivate`)
      .set(as())
      .expect(404);

    // Production is for those who manage it, not every login.
    const { token } = await kit.hire(await kit.group(), { login: true });
    await api(app).get('/tenant/production/operations').set(bearer(token!)).expect(403);
  });

  it("enters a line's day one operation at a time, keeping the rates entered with", async () => {
    const g = await kit.group();
    const a = (await kit.hire(g)).employee;
    const b = (await kit.hire(g)).employee;
    const late = (await kit.hire(g, { joinedOn: '2026-09-15' })).employee;
    const op = await operation({ pieceRate: '2', dailyTarget: 100, incentiveRate: '0.5' });
    const date = '2026-09-10';

    const first = (
      await save({
        date,
        operationId: op.id,
        entries: [
          { employeeId: a.id, quantity: 120 },
          { employeeId: b.id, quantity: '80' },
        ],
      })
    ).body as ProductionBatchResult;
    expect(first).toEqual({ saved: 2, removed: 0, unchanged: 0 });

    // The sewing section includes its lines; someone who joins later is not on it yet.
    const view = await day(date, 'MGT-SEW');
    expect(view.orgUnit.code).toBe('MGT-SEW');
    expect(view.operations.map((o) => o.id)).toContain(op.id);
    expect(workerOf(view, a.id)).toMatchObject({
      orgUnit: { code: 'MGT-L1' },
      locked: false,
      quantities: { [op.id]: 120 },
    });
    expect(workerOf(view, b.id)?.quantities).toEqual({ [op.id]: 80 });
    expect(workerOf(view, late.id)).toBeUndefined();
    expect(workerOf(await day(date, 'MGT-L2'), a.id)).toBeUndefined();

    // Saving the same again changes nothing.
    expect(
      (
        await save({
          date,
          operationId: op.id,
          entries: [
            { employeeId: a.id, quantity: 120 },
            { employeeId: b.id, quantity: 80 },
          ],
        })
      ).body,
    ).toEqual({ saved: 0, removed: 0, unchanged: 2 });

    // A new rate applies to new entries; a corrected entry keeps the rate it was made with.
    await api(app)
      .patch(`/tenant/production/operations/${op.id}`)
      .set(as())
      .send({ pieceRate: '3' })
      .expect(200);
    expect(
      (
        await save({
          date,
          operationId: op.id,
          entries: [
            { employeeId: a.id, quantity: '' },
            { employeeId: b.id, quantity: 90 },
          ],
        })
      ).body,
    ).toEqual({ saved: 1, removed: 1, unchanged: 0 });
    await save({
      date: '2026-09-11',
      operationId: op.id,
      entries: [{ employeeId: b.id, quantity: 110 }],
    });
    const month = await summary('2026-09', 'MGT-L1');
    expect(workerOf(month, a.id)).toBeUndefined();
    expect(workerOf(month, b.id)).toMatchObject({
      days: 2,
      pieces: 200,
      pieceEarnings: '510.00', // 90 × 2 + 110 × 3
      incentive: '5.00', // 10 above the target × 0.5
    });

    // Validation.
    const refused = async (body: Record<string, unknown>, status = 400) =>
      (await save({ date, operationId: op.id, ...body }, status)).body.code;
    expect(
      await refused({
        date: addDays(todayIn(), 1),
        entries: [{ employeeId: a.id, quantity: 1 }],
      }),
    ).toBe('production_future_date');
    expect(await refused({ entries: [{ employeeId: late.id, quantity: 5 }] })).toBe(
      'not_employed_on_date',
    );
    expect(await refused({ entries: [{ employeeId: a.id, quantity: -1 }] })).toBe(
      'validation_failed',
    );
    expect(await refused({ entries: [{ employeeId: a.id, quantity: 1.5 }] })).toBe(
      'validation_failed',
    );
    expect(
      await refused({
        entries: [
          { employeeId: a.id, quantity: 1 },
          { employeeId: a.id, quantity: 2 },
        ],
      }),
    ).toBe('validation_failed');
    expect(await refused({ entries: [{ employeeId: randomUUID(), quantity: 1 }] })).toBe(
      'production_employee_unknown',
    );
    await save(
      { date, operationId: randomUUID(), entries: [{ employeeId: a.id, quantity: 1 }] },
      404,
    );

    // An operation out of use takes no new pieces, but entries can still be removed.
    await api(app).post(`/tenant/production/operations/${op.id}/deactivate`).set(as()).expect(200);
    expect(await refused({ entries: [{ employeeId: b.id, quantity: 95 }] }, 409)).toBe(
      'operation_inactive',
    );
    expect(
      (
        await save({
          date: '2026-09-11',
          operationId: op.id,
          entries: [{ employeeId: b.id, quantity: 0 }],
        })
      ).body,
    ).toEqual({ saved: 0, removed: 1, unchanged: 0 });
    // Its entries still show on the day it has them.
    expect((await day(date, 'MGT-L1')).operations.map((o) => o.id)).toContain(op.id);
  });

  it('imports a sheet, saving the good rows and reporting each bad one', async () => {
    const g = await kit.group();
    const a = (await kit.hire(g)).employee;
    const late = (await kit.hire(g, { joinedOn: '2026-09-20' })).employee;
    const op = await operation({ pieceRate: '1.5' });
    const old = await operation({ pieceRate: '1' });
    await api(app).post(`/tenant/production/operations/${old.id}/deactivate`).set(as()).expect(200);
    const tomorrow = addDays(todayIn(), 1);

    const sheet = [
      'কর্মী কোড,তারিখ,অপারেশন কোড,পরিমাণ',
      `${a.employeeCode},2026-09-03,${op.code},100`,
      `${a.employeeCode.toLowerCase()},04/09/2026,${op.code.toLowerCase()},"১,২০০"`,
      `NOBODY-1,2026-09-03,${op.code},10`,
      `${a.employeeCode},2026-09-03,NO-SUCH-OP,10`,
      `${a.employeeCode},2026-13-01,${op.code},10`,
      `${a.employeeCode},${tomorrow},${op.code},10`,
      `${a.employeeCode},2026-09-05,${op.code},ten`,
      `${late.employeeCode},2026-09-05,${op.code},10`,
      `${a.employeeCode},2026-09-03,${op.code},50`,
      `${a.employeeCode},2026-09-05,${old.code},10`,
    ].join('\n');
    const result = (await upload('production.csv', sheet).expect(200))
      .body as ProductionImportResult;
    expect(result).toMatchObject({
      fileName: 'production.csv',
      rows: 10,
      saved: 2,
      removed: 0,
      unchanged: 0,
    });
    expect(result.problems.map((p) => [p.row, p.code])).toEqual([
      [3, 'employee_unknown'],
      [4, 'operation_unknown'],
      [5, 'date_invalid'],
      [6, 'date_future'],
      [7, 'quantity_invalid'],
      [8, 'not_employed'],
      [9, 'duplicate_row'],
      [10, 'operation_inactive'],
    ]);
    expect(result.problems[0]).toMatchObject({
      employeeCode: 'NOBODY-1',
      date: '2026-09-03',
      quantity: '10',
      message: expect.any(String),
    });
    expect(workerOf(await day('2026-09-04', 'MGT-L1'), a.id)?.quantities).toEqual({
      [op.id]: 1200,
    });

    // The same sheet again saves nothing new.
    const again = (await upload('production.csv', sheet).expect(200))
      .body as ProductionImportResult;
    expect(again).toMatchObject({ saved: 0, unchanged: 2 });

    // Excel, with English headings and real date cells.
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Output');
    ws.addRow(['Daily production, Line 1']);
    ws.addRow(['Emp ID', 'Date', 'Operation', 'Qty']);
    ws.addRow([a.employeeCode, new Date(Date.UTC(2026, 8, 6)), op.code, 30]);
    const xlsx = Buffer.from(await wb.xlsx.writeBuffer());
    const fromExcel = (await upload('line-1.xlsx', xlsx).expect(200))
      .body as ProductionImportResult;
    expect(fromExcel).toMatchObject({ rows: 1, saved: 1, problems: [] });
    expect(workerOf(await summary('2026-09', 'MGT-L1'), a.id)).toMatchObject({
      days: 3,
      pieces: 1330,
      pieceEarnings: '1995.00',
    });

    const template = await api(app).get('/tenant/production/import/template').set(as()).expect(200);
    expect(template.headers['content-type']).toContain('text/csv');
    expect(template.text.replace(/^﻿/, '').trim()).toBe(
      'Employee code,Date,Operation code,Quantity',
    );
    expect((await upload('notes.txt', 'hello').expect(400)).body.code).toBe('sheet_type');
    expect(
      (await upload('short.csv', `Employee code,Quantity\n${a.employeeCode},5`).expect(400)).body
        .code,
    ).toBe('production_import_columns');
    expect((await upload('empty.csv', template.text).expect(400)).body.code).toBe('sheet_empty');
    await api(app).post('/tenant/production/import').set(as()).expect(400);
  });

  it('sums a month by worker, line and day, as payroll reads it', async () => {
    const g = await kit.group();
    const a = (await kit.hire(g)).employee;
    const b = (await kit.hire(g)).employee;
    const op = await operation({ pieceRate: '2.5', dailyTarget: 50, incentiveRate: '1' });
    const enter = (date: string, entries: { employeeId: string; quantity: number }[]) =>
      save({ date, operationId: op.id, entries });
    await enter('2026-06-01', [
      { employeeId: a.id, quantity: 60 },
      { employeeId: b.id, quantity: 70 },
    ]);
    await enter('2026-06-02', [{ employeeId: a.id, quantity: 40 }]);

    const view = await summary('2026-06', 'MGT-SEW');
    expect(view).toMatchObject({ month: '2026-06', from: '2026-06-01', to: '2026-06-30' });
    expect(view.totals).toEqual({ pieces: 170, pieceEarnings: '425.00', incentive: '30.00' });
    expect(workerOf(view, a.id)).toMatchObject({
      orgUnit: { code: 'MGT-L1' },
      days: 2,
      pieces: 100,
      pieceEarnings: '250.00',
      incentive: '10.00',
      averageDaily: '125.00',
    });
    expect(workerOf(view, b.id)).toMatchObject({ days: 1, pieces: 70, incentive: '20.00' });
    expect(view.lines).toEqual([
      {
        orgUnit: expect.objectContaining({ code: 'MGT-L1' }),
        workers: 2,
        pieces: 170,
        pieceEarnings: '425.00',
        incentive: '30.00',
      },
    ]);
    expect(view.days).toEqual([
      { date: '2026-06-01', workers: 2, pieces: 130, pieceEarnings: '325.00', incentive: '30.00' },
      { date: '2026-06-02', workers: 1, pieces: 40, pieceEarnings: '100.00', incentive: '0.00' },
    ]);
    const other = await summary('2026-06', 'MGT-L2');
    expect(other).toMatchObject({ workers: [], lines: [], days: [] });
    expect(other.totals).toEqual({ pieces: 0, pieceEarnings: '0.00', incentive: '0.00' });

    const file = async (by: string) =>
      (
        await api(app)
          .get(
            `/tenant/production/summary/file?month=2026-06&orgUnitId=${unit('MGT-SEW')}&by=${by}`,
          )
          .set(as())
          .expect(200)
      ).text
        .replace(/^﻿/, '')
        .trim()
        .split('\n');
    const byWorker = await file('worker');
    expect(byWorker[0]).toBe(
      'Employee code,Name,Line,Days,Pieces,Piece earnings,Incentive,Average per day',
    );
    expect(byWorker).toContain(`${a.employeeCode},${a.fullName},Line 1,2,100,250.00,10.00,125.00`);
    expect(byWorker.at(-1)).toBe(',Total,,,170,425.00,30.00,');
    expect(await file('line')).toEqual([
      'Line code,Line,Workers,Pieces,Piece earnings,Incentive',
      'MGT-L1,Line 1,2,170,425.00,30.00',
      ',Total,,170,425.00,30.00',
    ]);
    expect((await file('day'))[1]).toBe('2026-06-01,2,130,325.00,30.00');
    await api(app).get('/tenant/production/summary?month=2026-13').set(as()).expect(400);
  });

  it('pays piece earnings above the time wage, and incentives above target, in payroll', async () => {
    const g = await kit.group();
    const piece = (await kit.hire(g, { gross: '12500' })).employee;
    const below = (await kit.hire(g, { gross: '12500' })).employee;
    const timed = (await kit.hire(g, { gross: '12500' })).employee;
    const pieceOp = await operation({ pieceRate: '25' });
    const targetOp = await operation({ dailyTarget: 100, incentiveRate: '1.5' });
    for (const date of ['2026-08-03', '2026-08-04']) {
      await save({
        date,
        operationId: pieceOp.id,
        entries: [{ employeeId: piece.id, quantity: 300 }],
      });
    }
    await save({
      date: '2026-08-03',
      operationId: pieceOp.id,
      entries: [{ employeeId: below.id, quantity: 200 }],
    });
    for (const [date, quantity] of [
      ['2026-08-03', 120],
      ['2026-08-04', 130],
      ['2026-08-05', 90],
    ] as const) {
      await save({ date, operationId: targetOp.id, entries: [{ employeeId: timed.id, quantity }] });
    }

    const run = await kit.run(g, '2026-08');
    expect((await kit.compute(run.id)).errors).toBe(0);
    const items = await kit.items(run.id);
    const itemOf = (id: string) => items.find((i) => i.employee.id === id)!;
    // 600 pieces × 25 = 15,000 against a month's time wage of 12,500: the excess on top.
    expect(line(itemOf(piece.id), 'PIECE_PAY')).toBe('2500.00');
    expect(itemOf(piece.id).net).toBe('15000.00');
    // 200 × 25 = 5,000 is below the time wage, which is paid as it is (s.149).
    expect(line(itemOf(below.id), 'PIECE_PAY')).toBeUndefined();
    expect(itemOf(below.id).net).toBe('12500.00');
    // (20 + 30) pieces above the target of 100, at 1.50.
    expect(line(itemOf(timed.id), 'PROD_INCENTIVE')).toBe('75.00');
    expect(line(itemOf(timed.id), 'PIECE_PAY')).toBeUndefined();

    const month = await summary('2026-08', 'MGT-L1');
    expect(workerOf(month, piece.id)).toMatchObject({ pieces: 600, pieceEarnings: '15000.00' });
    expect(workerOf(month, timed.id)).toMatchObject({ incentive: '75.00' });

    // Pieces entered after computing send the run back to draft, as an entered amount does.
    const runOf = async () =>
      (await api(app).get(`/tenant/payroll/runs/${run.id}`).set(bearer(kit.admin)).expect(200))
        .body as { status: string };
    expect((await runOf()).status).toBe('computed');
    await save({
      date: '2026-08-05',
      operationId: pieceOp.id,
      entries: [{ employeeId: piece.id, quantity: 40 }],
    });
    expect((await runOf()).status).toBe('draft');
    // While it waits for approval, production for its people cannot change.
    await kit.compute(run.id);
    await api(app).post(`/tenant/payroll/runs/${run.id}/submit`).set(bearer(kit.admin)).expect(200);
    const refused = await save(
      {
        date: '2026-08-06',
        operationId: pieceOp.id,
        entries: [{ employeeId: piece.id, quantity: 10 }],
      },
      409,
    );
    expect(refused.body.code).toBe('payroll_pending');
  });

  it('refuses changes to days whose pay is locked', async () => {
    const g = await kit.group();
    const paid = (await kit.hire(g)).employee;
    const unpaid = (await kit.hire(await kit.group())).employee;
    const op = await operation({ pieceRate: '2' });
    await save({
      date: '2026-07-10',
      operationId: op.id,
      entries: [
        { employeeId: paid.id, quantity: 50 },
        { employeeId: unpaid.id, quantity: 40 },
      ],
    });
    const run = await kit.run(g, '2026-07');
    await kit.compute(run.id);
    await kit.lock(run.id);

    const locked = await save(
      { date: '2026-07-15', operationId: op.id, entries: [{ employeeId: paid.id, quantity: 10 }] },
      409,
    );
    expect(locked.body.code).toBe('payroll_locked');
    expect(locked.body.message).toContain(paid.employeeCode);
    expect(
      (
        await save(
          {
            date: '2026-07-10',
            operationId: op.id,
            entries: [{ employeeId: paid.id, quantity: 0 }],
          },
          409,
        )
      ).body.code,
    ).toBe('payroll_locked');
    // Unchanged entries of a locked day are no change; others in the batch are saved.
    expect(
      (
        await save({
          date: '2026-07-10',
          operationId: op.id,
          entries: [
            { employeeId: paid.id, quantity: 50 },
            { employeeId: unpaid.id, quantity: 45 },
          ],
        })
      ).body,
    ).toEqual({ saved: 1, removed: 0, unchanged: 1 });
    const view = await day('2026-07-10', 'MGT-L1');
    expect(workerOf(view, paid.id)).toMatchObject({ locked: true, quantities: { [op.id]: 50 } });
    expect(workerOf(view, unpaid.id)).toMatchObject({ locked: false, quantities: { [op.id]: 45 } });

    const imported = (
      await upload(
        'july.csv',
        [
          'Employee code,Date,Operation code,Quantity',
          `${paid.employeeCode},2026-07-20,${op.code},5`,
          `${unpaid.employeeCode},2026-07-20,${op.code},5`,
        ].join('\n'),
      ).expect(200)
    ).body as ProductionImportResult;
    expect(imported.saved).toBe(1);
    expect(imported.problems.map((p) => [p.row, p.code])).toEqual([[1, 'payroll_locked']]);

    // The next month is still open.
    await save({
      date: '2026-08-01',
      operationId: op.id,
      entries: [{ employeeId: paid.id, quantity: 5 }],
    });
  });
});
