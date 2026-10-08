import { describe, expect, it } from 'vitest';
import { parseScript, RULES } from '../src';
import type { ParsedScript } from '../src/static/rule';
import { parsed } from './helpers';

function violations(
  ruleId: string,
  script: ParsedScript,
  options: Record<string, unknown> = {},
  others: ParsedScript[] = [],
) {
  const rule = RULES.get(ruleId)!;
  const scripts = new Map([script, ...others].map((s) => [s.alias, s]));
  return rule.check({ script, options, scripts });
}

const client = (source: string) =>
  parsed(source, { kind: 'client', table: 'sys_script_client', alias: 'client' });
const server = (source: string) => parsed(source);

describe('no-gliderecord-in-loop', () => {
  const check = (source: string) => violations('no-gliderecord-in-loop', server(source));

  it('accepts the standard query-then-iterate pattern', () => {
    expect(
      check(
        `var gr = new GlideRecord('incident'); gr.query(); while (gr.next()) { gs.info(gr.number); }`,
      ),
    ).toEqual([]);
  });

  it('flags a query inside a while body once per loop', () => {
    const found = check(`
      var inc = new GlideRecord('incident');
      inc.query();
      while (inc.next()) {
        var user = new GlideRecord('sys_user');
        user.get(inc.caller_id);
        user.query();
      }`);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ line: 5 });
  });

  it('flags GlideRecord.get on a record variable inside a for loop', () => {
    expect(
      check(
        `var u = new GlideRecord('sys_user'); for (var i = 0; i < ids.length; i++) { u.get(ids[i]); }`,
      ),
    ).toHaveLength(1);
  });

  it('flags queries inside forEach callbacks', () => {
    expect(
      check(
        `ids.forEach(function (id) { var g = new GlideRecordSecure('sys_user'); g.get(id); });`,
      ),
    ).toHaveLength(1);
  });

  it('ignores unrelated .get() calls in loops', () => {
    expect(check(`for (var k in map) { cache.get(k); }`)).toEqual([]);
  });
});

describe('no-hardcoded-sys-id', () => {
  it('flags 32-hex string literals and template strings, not other strings', () => {
    const found = violations(
      'no-hardcoded-sys-id',
      server(
        "var a = '62826bf03710200044e0bfc8bcbe5df1'; var b = `46d44a23a9fe19810012d100cca80666`; var c = 'VipCallerAjax';",
      ),
    );
    expect(found.map((f) => f.line)).toEqual([1, 1]);
  });
});

describe('ajax-include-extends-abstractajaxprocessor', () => {
  const rule = RULES.get('ajax-include-extends-abstractajaxprocessor')!;

  it('applies only to client-callable Script Includes', () => {
    expect(rule.appliesTo?.(server('') as never)).toBe(false);
    expect(rule.appliesTo?.({ ...server(''), record: { client_callable: 'true' } })).toBe(true);
  });

  it('accepts global.AbstractAjaxProcessor (scoped apps)', () => {
    expect(
      violations(
        'ajax-include-extends-abstractajaxprocessor',
        server(
          `X.prototype = Object.extendsObject(global.AbstractAjaxProcessor, { a: function () {} });`,
        ),
      ),
    ).toEqual([]);
  });

  it('flags a plain Class.create prototype', () => {
    expect(
      violations(
        'ajax-include-extends-abstractajaxprocessor',
        server(`var X = Class.create(); X.prototype = { initialize: function () {} };`),
      ),
    ).toHaveLength(1);
  });
});

describe('client rules', () => {
  it('flags getReference without a callback but not with one', () => {
    const found = violations(
      'no-sync-getreference',
      client(`var c = g_form.getReference('caller_id'); g_form.getReference('caller_id', cb);`),
    );
    expect(found).toHaveLength(1);
  });

  it('recognises different isLoading guard styles', () => {
    const guard = (body: string) =>
      violations(
        'onchange-isloading-guard',
        client(`function onChange(control, oldValue, newValue, isLoading) { ${body} }`),
      );
    expect(guard(`if (isLoading || newValue === '') return;`)).toEqual([]);
    expect(guard(`if (newValue == '' || isLoading) { return; }`)).toEqual([]);
    expect(guard(`g_form.showFieldMsg('a', 'b');`)).toHaveLength(1);
  });
});

describe('ajax-contract', () => {
  const include = parsed(
    `var VipCallerAjax = Class.create(); VipCallerAjax.prototype = Object.extendsObject(AbstractAjaxProcessor, { getVipInfo: function () {}, type: 'VipCallerAjax' });`,
    { alias: 'inc', name: 'VipCallerAjax' },
  );
  const contract = (source: string) =>
    violations('ajax-contract', client(source), { include: 'inc' }, [include]);

  it('accepts a matching name and method', () => {
    expect(
      contract(
        `var ga = new GlideAjax('VipCallerAjax'); ga.addParam('sysparm_name', 'getVipInfo');`,
      ),
    ).toEqual([]);
  });

  it('accepts a scope-prefixed name', () => {
    expect(
      contract(
        `var ga = new GlideAjax('global.VipCallerAjax'); ga.addParam('sysparm_name', 'getVipInfo');`,
      ),
    ).toEqual([]);
  });

  it('catches a misspelled method and lists the real ones', () => {
    const [problem] = contract(
      `var ga = new GlideAjax('VipCallerAjax'); ga.addParam('sysparm_name', 'getVIPInfo');`,
    );
    expect(problem?.message).toBe(
      "sysparm_name is 'getVIPInfo', but VipCallerAjax has no such method (it defines: getVipInfo).",
    );
  });

  it('catches a wrong class name, a missing sysparm_name and reserved parameters', () => {
    const found = contract(
      `var ga = new GlideAjax('VipCaller'); ga.addParam('sysparm_value', 'x');`,
    );
    expect(found.map((f) => f.message)).toEqual([
      'GlideAjax(\'VipCaller\') does not match the Script Include "VipCallerAjax".',
      'sysparm_value is reserved by GlideAjax; use your own sysparm_ name.',
      "No addParam('sysparm_name', ...): the server can't tell which method to run.",
    ]);
  });
});

describe('parseScript', () => {
  it('accepts typical ServiceNow script shapes', () => {
    expect(
      parseScript(
        '(function executeRule(current, previous) { current.update(); })(current, previous);',
      ).ok,
    ).toBe(true);
    expect(parseScript('return;').ok).toBe(true);
  });

  it('reports syntax errors with a 1-based position', () => {
    expect(parseScript('var a = 1;\nvar x = ;')).toMatchObject({ ok: false, line: 2, column: 9 });
  });
});
