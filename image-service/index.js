const app = require("@live-change/framework").app()

const definition = require('./definition.js')

require('./clientConfig.js')
require('./image.js')
require('./endpoint.js')

module.exports = definition
