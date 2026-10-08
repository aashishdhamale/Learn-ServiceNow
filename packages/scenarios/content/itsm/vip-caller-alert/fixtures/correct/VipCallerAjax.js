var VipCallerAjax = Class.create();
VipCallerAjax.prototype = Object.extendsObject(AbstractAjaxProcessor, {

    /**
     * Contract: reads sysparm_caller_id and returns a JSON string
     * {"vip": true, "managerName": "..."} or {"vip": false}.
     */
    getVipInfo: function () {
        var result = { vip: false };
        var callerId = this.getParameter('sysparm_caller_id');
        if (!callerId) {
            return JSON.stringify(result);
        }

        // GlideRecordSecure applies the agent's ACLs: no data the agent couldn't read anyway.
        var caller = new GlideRecordSecure('sys_user');
        if (!caller.get(callerId) || caller.vip != true) {
            return JSON.stringify(result);
        }

        result.vip = true;
        result.managerName = caller.manager.getDisplayValue() || '';
        return JSON.stringify(result);
    },

    type: 'VipCallerAjax'
});
