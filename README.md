# nomatic-data

[![Greenkeeper badge](https://badges.greenkeeper.io/bdfoster/nomatic-data.svg)](https://greenkeeper.io/)
[![Semantic Release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)
[![GitHub release](https://img.shields.io/github/release/bdfoster/nomatic-data.svg)](https://github.com/bdfoster/nomatic-data/releases)
[![npm](https://img.shields.io/npm/v/nomatic-data.svg)](https://www.npmjs.com/package/nomatic-data)
[![Build Status](https://travis-ci.org/bdfoster/nomatic-data.svg?branch=greenkeeper%2Finitial)](https://travis-ci.org/bdfoster/nomatic-data)
[![Coverage Status](https://coveralls.io/repos/github/bdfoster/nomatic-data/badge.svg)](https://coveralls.io/github/bdfoster/nomatic-data)
[![Known Vulnerabilities](https://snyk.io/test/github/bdfoster/nomatic-data/badge.svg)](https://snyk.io/test/github/bdfoster/nomatic-data)
[![dependencies Status](https://david-dm.org/bdfoster/nomatic-data/status.svg)](https://david-dm.org/bdfoster/nomatic-data)
[![devDependencies Status](https://david-dm.org/bdfoster/nomatic-data/dev-status.svg)](https://david-dm.org/bdfoster/nomatic-data?type=dev)
[![License](https://img.shields.io/github/license/bdfoster/nomatic-data.svg)](https://github.com/bdfoster/nomatic-data/blob/master/LICENSE)
[![Join the chat at https://gitter.im/nomatic-data/Lobby](https://badges.gitter.im/nomatic-data/Lobby.svg)](https://gitter.im/nomatic-data/Lobby?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

Extensible Object-relational Mapping Framework for Node.js

### Overview
Written in TypeScript, this package uses Active Record, Data Mapper, and Adapter
patterns to create an Object-Relational Mapping (ORM) tool that provides flexibility and extensibility.

Adapters allow you to connect to a variety of data sources. You can use a pre-built Adapter (see table below), 
or you can write your own by implementing either the [Adapter](https://bdfoster.github.io/nomatic-data/classes/adapter.html) or [DatabaseAdapter](https://bdfoster.github.io/nomatic-data/classes/databaseadapter.html) abstract classes.

Each `Adapter` is operated by one or more `Mapper` instances. Each `Mapper` instance is managed by a `Container`
instance. A `Mapper` will generate `Record` instances, which store the state of each document in the collection.

### Installation
You can install from [npm](https://www.npmjs.com/package/nomatic-data) by doing:
```
npm i --save nomatic-data
```

If you want to write your own adapter, you can stop there. Otherwise, you'll need to install an adapter:

| Adapter | Author | Links | Installation |
| :--- | :--- | :--- | :--- |
| [ArangoDB](https://arangodb.com) | [bdfoster](https://github.com/bdfoster) | [npm](https://npmjs.com/package/nomatic-arangodb-adapter), [GitHub](https://github.com/bdfoster/nomatic-arangodb-adapter) | `npm i --save nomatic-arangodb-adapter` |

### Example
This example uses the [ArangoDB](https://npmjs.com/package/nomatic-arangodb-adapter) adapter.

```javascript
import { Container } from 'nomatic-data';
import ArangoDBAdapter from 'nomatic-arangodb-adapter';

const adapter = new ArangoDBAdapter({
    name: 'my-database',
    host: '127.0.0.1',
    port: 8579,
    password: 'somethingMoreSecureThanThis'
});

const store = new Container({
    adapter: adapter,
    
    /**
     * A few hooks are provided for your convenience, including:
     * - beforeGet
     * - afterGet
     * - beforeInsert
     * - afterInsert
     * - beforeUpdate
     * - afterUpdate
     * - beforeValidate
     * - afterValidate
     */ 
    beforeInsert(mapper, record) {
        record.createdAt = new Date();
    },
    beforeUpdate(mapper, record) {
        record.updatedAt = new Date();
    },
    
    /**
     * Here, we define the schema of all of our mappers. Other options
     * for each mapper can also be set here. Schema validation is provided
     * by [ajv](https://github.com/epoberezkin/ajv).
     */
    mappers: {
        people: {
            properties: {
                /**
                 * Implicit properties, such as `id` and `rev`, need not be 
                 * defined here. 
                 */ 
                firstName: {
                    type: 'string'
                },
                lastName: {
                    type: 'string'
                },
                emailAddress: {
                    type: 'string',
                    format: 'email'
                }
            },
            required: ['firstName', 'lastName'],
            /**
             * By default, additional properties are allowed in the record.
             */
            additionalProperties: false
        },
        accounts: {
            properties: {
                people: {
                    type: 'array',
                    items: {
                        type: 'string',
                        /**
                         * The 'mapper' keyword enforces relational integrity. Each item
                         * in this array matches an `id` of a record in the collection
                         * managed by the 'people' mapper.
                         */ 
                        mapper: 'people'
                    },
                    default: []
                }
            }
        }
    }
});

/**
 * The `load()` method will establish a connection with the database server, 
 * ensure that the database exists (or it will try and create it), and 
 * ensure all collection exists (or will create them).
 */
store.load().then(() => {
    return store.insertAll('people', [
        { firstName: 'John', lastName: 'Doe' },
        { firstName: 'Jane', lastName: 'Doe' }
    ]);
}).then(() => {
    /**
     * This is one way you can query for documents.
     */
    store.find('people')
        .where('lastName')
        .eq('Doe')
        .sort('firstName', 1)
        .limit(2)
        .skip(1)
        .run().then((results) => {
        //...
    });
    
    /**
     * You can also query much like how MongoDB query filters. The supported operators are:
     *  - $and
     *      Syntax: { $where: { $and: [ <expression>, ..., <expression> }, ... }
     *  - $or
     *      Syntax: { $where: { $or: [ <expression>, ..., <expression> }, ... }
     *  - $eq (expression)
     *      Syntax: { <property>: { $eq: { <value> } }
     *  - $ne (expression)
     *      Syntax: { <property>: { $ne: { <value> } }
     *  - $gt (expression)
     *      Syntax: { <property>: { $gt: { <value> } }
     *  - $gte (expression)
     *      Syntax: { <property>: { $gte: { <value> } }
     *  - $lt (expression)
     *      Syntax: { <property>: { $lt: { <value> } }
     *  - $lte (expression)
     *      Syntax: { <property>: { $lte: { <value> } }
     *  - $in (expression)
     *      Syntax: { <property>: { $in: [ <value>, ..., <value> ] }
     *  - $nin (expression)
     *      Syntax: { <property>: { $nin: [ <value>, ..., <value> ] }
     *  - $exists (expression)
     *      Syntax: { <property>: { $exists: <true | false> } }
     * 
     * An expression always follows this form: 
     *  { <property>: { <operator>: <value> | [ <value>, ..., <value>] }
     *  
     * All the operators above can only be used in a $where object. 
     */
    store.findAll('people', {
        $where: {
            firstName: 'Jane'
        },
        $sort: [
            ['firstName', 1]
        ],
        $limit: 2,
        $skip: 1
    }).then((results) => {
        //...
    });
});
```
The API documentation (generated by [TypeDoc](http://typedoc.org/)) can be found 
[here](https://bdfoster.github.io/nomatic-data/).

More documentation will be added as moves forward, but if you have a question please feel free to 
[open an issue](https://github.com/bdfoster/nomatic-data/issues).
