const app = require("@live-change/framework").app()

const security = require('@live-change/security-service')

const definition = app.createServiceDefinition({
  name: "messageAuthentication",
  use: [ security ]
})

module.exports = definition
