# nomatic-data

[![Greenkeeper badge](https://badges.greenkeeper.io/bdfoster/nomatic-data.svg)](https://greenkeeper.io/)
[![Semantic Release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)
[![GitHub release](https://img.shields.io/github/release/bdfoster/nomatic-data.svg)](https://github.com/bdfoster/nomatic-data/releases)
[![npm](https://img.shields.io/npm/v/nomatic-data.svg)](https://www.npmjs.com/package/nomatic-data)
[![Build Status](https://travis-ci.org/bdfoster/nomatic-data.svg?branch=greenkeeper%2Finitial)](https://travis-ci.org/bdfoster/nomatic-data)
[![Coverage Status](https://coveralls.io/repos/github/bdfoster/nomatic-data/badge.svg)](https://coveralls.io/github/bdfoster/nomatic-data)
[![dependencies Status](https://david-dm.org/bdfoster/nomatic-data/status.svg)](https://david-dm.org/bdfoster/nomatic-data)
[![devDependencies Status](https://david-dm.org/bdfoster/nomatic-data/dev-status.svg)](https://david-dm.org/bdfoster/nomatic-data?type=dev)
[![License](https://img.shields.io/github/license/bdfoster/nomatic-data.svg)](https://github.com/bdfoster/nomatic-data/blob/master/LICENSE)

Extensible Object-relational Mapping Framework for Node.js

### Overview
Written in TypeScript, this package uses Active Record, Data Mapper, and Adapter
patterns to create an Object-Relational Mapping (ORM) tool that provides flexibility and extensibility.

Adapters allow you to connect to a variety of data sources. Currently, an adapter for ArangoDB is included in this
package, but you can make your own by implementing either the `Adapter` or `DatabaseAdapter` abstract classes.Adapters 
for MongoDB and LokiJS are coming in the near future.

Each `Adapter` is operated by one or more `Mapper` instances. Each `Mapper` instance is managed by a `Container`
instance.

### Installation
You can install from [npm](https://www.npmjs.com/package/nomatic-data) by doing:
```
npm i --save nomatic-data
```

### Example
```javascript
import { ArangoDBAdapter, Container } from 'nomatic-data';

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
     * - beforeInsert
     * - afterInsert
     * - beforeUpdate
     * - afterUpdate
     */ 
    beforeInsert(record) {
        record.createdAt = new Date();
    },
    beforeUpdate(record) {
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