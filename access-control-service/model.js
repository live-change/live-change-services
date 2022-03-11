const definition = require('./definition.js')
const config = definition.config
const access = require('./access.js')(definition)

const Access = definition.model({
  name: 'Access',
  sessionOrUserItem: {
    ownerReadAccess: true
  },
  itemOfAny: {
    to: 'object',
    readAccess: (params, { client, context }) => access.clientHasAnyAccess(client, params.ownerType, params.owner),
    writeAccess: (params, { client, context }) => access.clientHasAdminAccess(client, params.ownerType, params.owner)
  },
  properties: {
    role: {
      type: String,
      validation: ['nonEmpty']
    }
  }
})

const PublicAccess = definition.model({
  name: "PublicAccess",
  propertyOfAny: {
    to: 'object',
    readAccess: (params, { client, context }) => access.clientHasAnyAccess(client, params.ownerType, params.owner),
    writeAccess: (params, { client, context }) => access.clientHasAdminAccess(client, params.ownerType, params.owner)
  },
  properties: {
    userRole: {
      type: String,
      validation: ['nonEmpty']
    },
    sessionRole: {
      type: String,
      validation: ['nonEmpty']
    },
  },
  indexes: {
  }
})

const AccessRequest = definition.model({
  name: 'AccessRequest',
  sessionOrUserItem: {
  },
  itemOfAny: {
    to: 'object',
    readAccess: (params, { client, context }) => access.clientHasAdminAccess(client, params.ownerType, params.owner)
  },
  properties: {
    role: {
      type: String,
      validation: ['nonEmpty']
    },
    message: {
      type: String,
      validation: []
    }
  },
  indexes: {
  }
})

module.exports = { Access, PublicAccess, AccessRequest }