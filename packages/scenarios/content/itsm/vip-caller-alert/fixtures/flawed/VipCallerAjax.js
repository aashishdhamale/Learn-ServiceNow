var VipCallerAjax = Class.create();
VipCallerAjax.prototype = Object.extendsObject(AbstractAjaxProcessor, {

    getVipInfo: function () {
        var caller = new GlideRecord('sys_user');
        caller.get(this.getParameter('sysparm_caller_id'));
        return JSON.stringify({ vip: caller.vip == true, managerName: caller.manager.getDisplayValue() });
    },

    type: 'VipCallerAjax'
});
