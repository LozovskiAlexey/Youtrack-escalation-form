exports.httpHandler = {
  endpoints: [
    {
      scope: 'issue',
      method: 'GET',
      path: 'settings',
      handle: function (ctx) {
        ctx.response.json({
          bridgeUrl: ctx.settings.bridgeUrl || '',
          configUrl: ctx.settings.configUrl || ''
        });
      }
    }
  ]
};