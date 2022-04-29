const definition = require("./definition.js")
const App = require("@live-change/framework")
const { PropertyDefinition, ViewDefinition, IndexDefinition, ActionDefinition, EventDefinition } = App
const { User } = require("./model.js")
const { allCombinations } = require("./combinations.js")
const { createIdentifiersProperties } = require('./utils.js')

const pluralize = require('pluralize')

definition.processor(function(service, app) {

  for(let modelName in service.models) {
    const model = service.models[modelName]

    if(model.contactOrUserProperty) {
      console.log("MODEL " + modelName + " IS SESSION OR USER PROPERTY, CONFIG:", model.userProperty)
      if (model.properties.contactOrUser) throw new Error('owner property already exists!!!')

      const originalModelProperties = { ...model.properties }
      const modelProperties = Object.keys(model.properties)
      const defaults = App.utils.generateDefault(model.properties)

      function modelRuntime() {
        return service._runtime.models[modelName]
      }

      const config = model.contactOrUserProperty
      const writeableProperties = modelProperties || config.writableProperties

      if(model.propertyOf) throw new Error("model " + modelName + " already have owner")
      if(model.propertyOfAny) throw new Error("model " + modelName + " already have owner")

      const extendedWith = config.extendedWith
          ? (Array.isArray(config.extendedWith) ? config.extendedWith : [config.extendedWith])
          : []

      model.propertyOfAny = {
        ...config,
        to: ['contactOrUser', ...extendedWith]
      }

      const transferEventName = ['contactOrUser', ...(extendedWith.map(e => e[0].toUpperCase() + e.slice(1)))]
          .join('And') + 'Owned' + modelName + 'Transferred'

      service.trigger({
        name: 'contactConnected',
        properties: {
          contactType: {
            type: String,
            validation: ['nonEmpty']
          },
          contact: {
            type: String,
            validation: ['nonEmpty']
          },
          user: {
            type: User,
            validation: ['nonEmpty']
          }
        },
        async execute({ contactType, contact, user }, { service }, emit) {
          const contactPath = [contactType, contact]
          const contactPropertyId = contactPath.map(p => JSON.stringify(p)).join(':')
          const range = {
            gte: contactPropertyId + '', // '' because it can be not-extended
            lte: contactPropertyId + ':\xFF'
          }
          const contactProperties = await modelRuntime().rangeGet(range)
          /// TODO: list based merge method
          for(const contactProperty of contactProperties) {
            console.log("CONTACT PROPERTY FOUND!", contactProperty, "MERGE =", config.merge)
            const userPath = ['user_User', user]
            const userPropertyId = userPath.map(p => JSON.stringify(p)).join(':')
            const userProperty = await modelRuntime().get(userPropertyId)
            if(config.merge) {
              const mergeResult = await config.merge(contactProperty, userProperty)
              if(mergeResult && userProperty) {
                emit({
                  type: 'contactOrUserOwned' + modelName + 'Updated',
                  identifiers: {
                    contactOrUserType: 'user_User',
                    contactOrUser: user
                  },
                  data: mergeResult
                })
              } else {
                emit({
                  type: 'contactOrUserOwned' + modelName + 'Set',
                  identifiers: {
                    contactOrUserType: 'user_User',
                    contactOrUser: user
                  },
                  data: mergeResult
                })
              }
              emit({
                type: 'contactOrUserOwned' + modelName + 'Reset',
                identifiers: {
                  contactOrUserType: contactType,
                  contactOrUser: contact
                }
              })
            } else {
              if(!userProperty) {
                const extendedIdentifiers = {}
                for(const key of extendedWith) {
                  extendedIdentifiers[key+'Type'] = contactProperty[key+'Type']
                  extendedIdentifiers[key] = contactProperty[key]
                }
                emit({
                  type: transferEventName,
                  from: {
                    contactOrUserType: contactType,
                    contactOrUser: contact,
                    ...extendedIdentifiers
                  },
                  to: {
                    contactOrUserType: 'user_User',
                    contactOrUser: user,
                    ...extendedIdentifiers
                  }
                })
              }
            }
          }
        }
      })

      if(config.ownerReadAccess) { // single item view
        const viewName = 'my' + modelName
        const identifiers = createIdentifiersProperties(extendedWith)
        service.views[viewName] = new ViewDefinition({
          name: viewName,
          properties: {
            ...identifiers
          },
          access(params, context) {
            return context.client.user && (config.ownerReadAccess ? config.ownerReadAccess(params, context) : true)
          },
          daoPath(params, { client, context }) {
            const owner = ['user_User', client.user]
            for(const key of extendedWith) {
              owner.push(params[key+'Type'], params[key])
            }
            const id = owner.map(p => JSON.stringify(p)).join(':')
            return modelRuntime().path(id)
          }
        })
      }

      if(config.ownerReadAccess && config.extendedWith) {
        const extendedCombinations = [[]].concat(allCombinations(extendedWith).slice(0, -1))
        for(const combination of extendedCombinations) {
          const propsUpperCase = combination.map(prop => prop[0].toUpperCase() + prop.slice(1))
          const indexName = 'by' + (combination).map(prop => prop[0].toUpperCase() + prop.slice(1))
          const viewName = 'my' + propsUpperCase.join('And') + pluralize(modelName)
          const identifiers = createIdentifiersProperties(combination)
          service.views[viewName] = new ViewDefinition({
            name: viewName,
            properties: {
              ...identifiers,
              ...App.rangeProperties,
            },
            access(params, context) {
              return context.client.user && (config.ownerReadAccess ? config.ownerReadAccess(params, context) : true)
            },
            daoPath(params, { client, context }) {
              const owner = ['user_User', client.user]
              for (const key of combination) {
                owner.push(params[key + 'Type'], params[key])
              }
              return modelRuntime().indexRangePath(indexName, owner, App.extractRange(params) )
            }
          })
        }
      }

      if(config.ownerViews) {
        for(const view of config.userViews) {
          const viewName = view.name || ('my' + (view.prefix || '') + modelName + (view.suffix || ''))
          service.views[viewName] = new ViewDefinition({
            name: viewName,
            access(params, context) {
              return context.client.user && (view.access ? view.access(params, context) : true)
            },
            daoPath(params, { client, context }) {
              const owner = ['user_User', client.user]
              const id = owner.map(p => JSON.stringify(p)).join(':')
              return view.fields
                ? modelRuntime().limitedPath(id, view.fields)
                : modelRuntime().path(id)
            }
          })
        }
      }

      const eventPrefix = ['contactOrUser',
        ...(extendedWith.map(p => p[0].toUpperCase()+p.slice(1)))
      ].join('And') +'Owned'

      if(config.ownerSetAccess || config.ownerWriteAccess) {
        const eventName = eventPrefix + modelName + 'Set'
        const actionName = 'setMy' + modelName
        service.actions[actionName] = new ActionDefinition({
          name: actionName,
          properties: {
            ...originalModelProperties
          },
          access: (params, context) => context.client.user
              && (config.ownerSetAccess || config.ownerWriteAccess)(params, context),
          skipValidation: true,
          queuedBy: (command) => command.client.user ? 'u:'+command.client.user : 's:'+command.client.session,
          waitForEvents: true,
          async execute(properties, {client, service}, emit) {
            let newObject = {}
            for(const propertyName of writeableProperties) {
              if(properties.hasOwnProperty(propertyName)) {
                newObject[propertyName] = properties[propertyName]
              }
            }
            const data = App.utils.mergeDeep({}, defaults, newObject)
            await App.validation.validate(data, validators, { source: action, action, service, app, client })
            const identifiers = {
              ownerType: 'user_User',
              owner: client.user,
            }
            emit({
              type: eventName,
              identifiers,
              data
            })
          }
        })
        const action = service.actions[actionName]
        const validators = App.validation.getValidators(action, service, action)
      }

      if(config.ownerUpdateAccess || config.ownerWriteAccess) {
        const eventName = eventPrefix + modelName + 'Updated'
        const actionName = 'updateMy' + modelName
        service.actions[actionName] = new ActionDefinition({
          name: actionName,
          properties: {
            ...originalModelProperties
          },
          access: (params, context) => context.client.user
              && (config.ownerUpdateAccess || config.ownerWriteAccess)(params, context),
          skipValidation: true,
          queuedBy: (command) => command.client.user ? 'u:'+command.client.user : 's:'+command.client.session,
          waitForEvents: true,
          async execute(properties, { client, service }, emit) {
            const owner = client.user ? ['user_User', client.user] : ['session_Session', client.session]
            const id = owner.map(p => JSON.stringify(p)).join(':')
            const entity = await modelRuntime().get(id)
            if(!entity) throw 'not_found'
            let updateObject = {}
            for(const propertyName of writeableProperties) {
              if(properties.hasOwnProperty(propertyName)) {
                updateObject[propertyName] = properties[propertyName]
              }
            }
            const merged = App.utils.mergeDeep({}, entity, updateObject)
            await App.validation.validate(merged, validators, { source: action, action, service, app, client })
            const identifiers = {
              ownerType: 'user_User',
              owner: client.user,
            }
            emit({
              type: eventName,
              identifiers,
              data: properties || {}
            })
          }
        })
        const action = service.actions[actionName]
        const validators = App.validation.getValidators(action, service, action)
      }

      if(config.ownerResetAccess || config.ownerWriteAccess) {
        const eventName = eventPrefix + modelName + 'Reset'
        const actionName = 'resetMy' + modelName
        service.actions[actionName] = new ActionDefinition({
          name: actionName,
          access: (params, context) => context.client.user
              && (config.ownerResetAccess || config.ownerWriteAccess)(params, context),
          queuedBy: (command) => command.client.user ? 'u:'+command.client.user : 's:'+command.client.session,
          waitForEvents: true,
          async execute(properties, {client, service}, emit) {
            const owner = client.user ? ['user_User', client.user] : ['session_Session', client.session]
            const id = owner.map(p => JSON.stringify(p)).join(':')
            const entity = await modelRuntime().get(id)
            if (!entity) throw 'not_found'
            const identifiers = {
              ownerType: 'user_User',
              owner: client.user,
            }
            emit({
              type: eventName,
              identifiers
            })
          }
        })
      }

    }
  }

})