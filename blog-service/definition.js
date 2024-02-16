import App from '@live-change/framework'
const app = App.app()

import relationsPlugin from '@live-change/relations-plugin'
const accessControlService = require('@live-change/access-control-service')

const definition = app.createServiceDefinition({
  name: "blog",
  use: [ relationsPlugin, accessControlService ]
})

export default definition
