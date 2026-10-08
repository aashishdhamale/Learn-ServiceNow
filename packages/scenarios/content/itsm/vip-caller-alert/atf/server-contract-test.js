// ATF "Run Server Side Script" step for the VIP caller alert scenario.
// Paste everything between START and END inside the function body of the step's script
// (keep the wrapper your release generates). The test creates its own users, which ATF
// rolls back after the run, and calls VipCallerAjax the way GlideAjax does: through a
// request object that answers getParameter().

// ----- START -----
var failures = [];

function check(name, expected, actual) {
    if (expected !== actual) {
        failures.push(name + ': expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
    }
}

function createUser(fields) {
    var user = new GlideRecord('sys_user');
    user.initialize();
    for (var field in fields) {
        user.setValue(field, fields[field]);
    }
    return user.insert();
}

function callGetVipInfo(label, callerId) {
    var params = { sysparm_name: 'getVipInfo', sysparm_caller_id: callerId };
    var request = {
        getParameter: function (name) {
            return params.hasOwnProperty(name) ? params[name] : null;
        }
    };
    var answer = new global.VipCallerAjax(request, null, null).getVipInfo();
    try {
        return JSON.parse(answer);
    } catch (e) {
        failures.push(label + ': getVipInfo must return a JSON string, got ' + answer);
        return null;
    }
}

var suffix = gs.generateGUID();
var managerId = createUser({ first_name: 'Atf', last_name: 'Manager', user_name: 'atf.manager.' + suffix });
var vipId = createUser({ first_name: 'Atf', last_name: 'Vip', user_name: 'atf.vip.' + suffix, vip: true, manager: managerId });
var vipWithoutManagerId = createUser({ first_name: 'Atf', last_name: 'Solo', user_name: 'atf.solo.' + suffix, vip: true });
var regularId = createUser({ first_name: 'Atf', last_name: 'Regular', user_name: 'atf.regular.' + suffix, vip: false, manager: managerId });

var manager = new GlideRecord('sys_user');
manager.get(managerId);
var expectedManagerName = manager.getDisplayValue();

var vip = callGetVipInfo('VIP caller', vipId);
if (vip) {
    check('VIP caller: vip', true, vip.vip);
    check('VIP caller: managerName', expectedManagerName, vip.managerName);
}

var solo = callGetVipInfo('VIP without manager', vipWithoutManagerId);
if (solo) {
    check('VIP without manager: vip', true, solo.vip);
    check('VIP without manager: managerName', '', solo.managerName);
}

var regular = callGetVipInfo('Non-VIP caller', regularId);
if (regular) {
    check('Non-VIP caller: vip', false, regular.vip);
}

var unknown = callGetVipInfo('Unknown caller', gs.generateGUID());
if (unknown) {
    check('Unknown caller: vip', false, unknown.vip);
}

var empty = callGetVipInfo('Empty caller', '');
if (empty) {
    check('Empty caller: vip', false, empty.vip);
}

if (failures.length > 0) {
    stepResult.setOutputMessage('VipCallerAjax.getVipInfo broke the contract:\n- ' + failures.join('\n- '));
    return false;
}
stepResult.setOutputMessage('VipCallerAjax.getVipInfo honours the contract for VIP, non-VIP, unknown and empty callers.');
return true;
// ----- END -----
