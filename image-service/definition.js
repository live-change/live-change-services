const app = require("@live-change/framework").app()

const relationsPlugin = require('@live-change/relations-plugin')

const definition = app.createServiceDefinition({
  name: "image",
  use: [ relationsPlugin ]
})

module.exports = definition
