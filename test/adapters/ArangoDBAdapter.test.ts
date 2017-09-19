import 'mocha';
import {expect} from 'chai';
import ArangoDBAdapter from '../../src/adapters/ArangoDBAdapter';
import {RecordData} from '../../src/Record';
import Query from '../../src/Query';
import queries from '../fixtures/queries';
import {inspect} from 'util';

describe('ArangoDBAdapter', () => {
    let mock = require('../fixtures/mock.json');
    const data: Array<RecordData> = [
        {
            id: "12345678",
            boolean: true,
            string: 'Hello, world'
        }
    ];

    let collectionName = 'test_collection';
    let config = require('../fixtures/config/' + process.env.NODE_ENV + '.json')['arangodb'];
    let instance: ArangoDBAdapter;
    before((done) => {
        instance = new ArangoDBAdapter(config);
        instance.getDatabaseNames().then((list) => {
            if (list.indexOf(config.name) !== -1) {
                return instance.dropDatabase();
            }
        }).then(() => {
            return instance.createDatabase();
        }).then(() => {
            instance.name = config.name;
            return instance.load();
        }).then(done, done);
    });

    describe('#getDatabaseNames()', () => {
        it('should return an array of database names', (done) => {
            instance.getDatabaseNames().then((list) => {
                expect(list).to.be.an('Array');
                expect(list.indexOf(config.name)).to.not.equal(-1);
            }).then(done, done);
        });
    });

    describe('#ensureCollectionExists()', () => {
        it('should return true if collection does not already exist', (done) => {
            instance.ensureCollectionExists(collectionName).then((itWasCreated) => {
                if (itWasCreated) {
                    return done();
                }

                return done(new Error('Returned: ' + itWasCreated));
            });
        });

        it('should return false if collection already exists', (done) => {
            instance.ensureCollectionExists(collectionName).then((itWasCreated) => {
                if (itWasCreated) {
                    return done(new Error('Returned: ' + itWasCreated));
                }

                return done();
            });
        });

        it('should not create a collection on the _system database', (done) => {
            instance.name = '_system';

            instance.ensureCollectionExists(collectionName).then(() => {
                instance.name = config.name;
                throw new Error('Did not throw!');
            }).catch((error) => {
                instance.name = config.name;
                if (error.message === 'Cannot create a collection on _system database: ' + collectionName) {
                    return done();
                }

                return done(error);
            });
        });
    });

    describe('#ensureDatabaseExists()', () => {
        it('should return true if database does not already exist', (done) => {
            instance.ensureDatabaseExists('test_database').then((itWasCreated) => {
                expect(instance.name).to.equal(config.name);
                return instance.dropDatabase('test_database').then(() => {
                    if (itWasCreated) {
                        return done();
                    }

                    return done(new Error('Returned: ' + itWasCreated));
                });
            }).catch(done);
        });

        it('should return false if database already exists', () => {
            return instance.ensureDatabaseExists().then((itWasCreated) => {
                if (itWasCreated) {
                    throw Error('Returned: ' + itWasCreated);
                }
            });
        });
    });

    describe('#insert()', () => {
        it('should insert a new document into the current database', (done) => {
            instance.insert(collectionName, data[0]).then((result) => {
                expect(result).to.exist;
                expect(result.id).to.equal(data[0].id);
                expect(result.rev).to.exist;
                expect(result.boolean).to.equal(data[0].boolean);
                expect(result.string).to.equal(data[0].string);
                data[0] = result;
            }).then(done, done);
        });

        it('should throw if `id` already exists', (done) => {
            instance.insert(collectionName, data[0]).then(() => {
                return done('Did not throw!');
            }).catch((error) => {
                if (error.name === 'AlreadyExistsError') {
                    return done();
                }

                return done(error);
            });
        });

        it('should throw if `collection` does not exist', (done) => {
            instance.insert('doesNotExist', data[0]).then(() => {
                return done('Did not throw!');
            }).catch((error) => {
                if (error.name === 'AdapterError' && error.message.startsWith('Database `' + config.name + '` has no')) {
                    return done();
                }

                return done(error);
            });
        });
    });

    describe('#insertAll()', () => {
        it('should insert an array of documents', function(done) {
            this.timeout(30000);
            instance.insertAll(collectionName, mock).then((results) => {
                mock = results;
                return done();
            }).catch(done);
        });
    });

    describe('#get()', () => {
        it('should get an existing document', (done) => {
            instance.get(collectionName, data[0]['id']).then((result) => {
                expect(result).to.deep.equal(data[0]);
            }).then(done, done);
        });
    });

    describe('#update()', () => {
        it('should update an existing document', (done) => {
            data[0].boolean = false;

            instance.update(collectionName, data[0].id, data[0]).then((result) => {
                expect(result.id).to.equal(data[0].id);
                expect(result.rev).to.not.equal(data[0].rev);
                expect(result.boolean).to.equal(false);
                data[0] = result;
                return done();
            }).catch(done);
        });

        it('should throw when updating a non-existent document', (done) => {
            instance.update(collectionName, '00000000', data[0]).then(() => {
                return done('Did not throw!');
            }).catch((error) => {
                if (error.name === 'NotFoundError') {
                    return done();
                }

                return done(error);
            });
        });
    });

    describe('#replace()', () => {
        it('should replace an existing document', (done) => {
            data[0].boolean = true;

            instance.replace(collectionName, data[0].id, data[0]).then((result) => {
                expect(result.id).to.equal(data[0].id);
                expect(result.rev).to.not.equal(data[0].rev);
                expect(result.boolean).to.equal(true);
                data[0] = result;
            }).then(done, done);
        });

        it('should throw when replacing a non-existent document', (done) => {
            instance.replace(collectionName, '00000000', data[0]).then(() => {
                return done('Did not throw!');
            }).catch((error) => {
                if (error.name === 'NotFoundError') {
                    return done();
                }

                return done(error);
            });
        });
    });

    describe('#findAll()', () => {
        it('should return all rows', (done) => {
            instance.findAll(collectionName).then((results) => {
                expect(results.length).to.equal(mock.length + data.length);

                for (const i in results) {
                    expect(results[i]['id']).to.not.be.null;
                    expect(results[i]['rev']).to.not.be.null;
                    expect(results[i]['_key']).to.not.exist;
                    expect(results[i]['_id']).to.not.exist;
                    expect(results[i]['_rev']).to.not.exist;
                }
            }).then(done, done);
        });

        it('should return only the row where `id` is ' + data[0]['id'], (done) => {
            instance.findAll(collectionName, new Query(null, {
                $where: {
                    id: data[0]['id']
                }
            })).then((results) => {
                expect(results.length).to.equal(1);
                expect(results[0].id).to.equal(data[0].id);
            }).then(done, done);
        });

        it('should only return one result when `$limit` is 1 and where `id` is ' + data[0]['id'], (done) => {
            instance.findAll(collectionName, new Query(null, {
                $limit: 1,
                $where: {
                    id: data[0]['id']
                },
            })).then((results) => {
                expect(results.length).to.equal(1);
                expect(results[0].id).to.equal(data[0].id);
            }).then(done, done);
        });

        it('should only return results where `isActive` is false', (done) => {
            instance.findAll(collectionName, new Query(null, {
                $where: {
                    isActive: false
                }
            })).then((results) => {
                expect(results.length).to.equal(525);

                for (const i in results) {
                    expect(results[i]['isActive']).to.equal(false);
                }
            }).then(done, done);
        });

        it('should only return `id` and `rev` fields', (done) => {
            instance.findAll(collectionName, new Query(null, {
                $fields: ['id', 'rev']
            })).then((results) => {
                expect(results.length).to.equal(1001);

                for (const i in results) {
                    expect(results[i]).to.have.keys([
                        'id',
                        'rev'
                    ]);
                }
            }).then(done, done);
        });
    });

    describe('#getCollectionNames()', () => {
        it('should return an array of collection names', (done) => {
            instance.getCollectionNames().then((list) => {
                expect(list).to.be.an('Array');
                expect(list.length).to.equal(1);
                expect(list[0]).to.equal(collectionName);
            }).then(done, done);
        });
    });

    describe('#remove()', () => {
        it('should remove an existing document', (done) => {
            instance.remove(collectionName, data[0]['id']).then((result) => {
                expect(result).to.deep.equal(data[0]);
            }).then(done, done);
        });
    });

    describe('#truncateCollection', () => {
        it('should truncate a collection that exists', (done) => {
            instance.truncateCollection(collectionName).then((isSuccessful) => {
                expect(isSuccessful).to.equal(true);
            }).then(done, done);
        });
    });

    describe('#dropCollection()', () => {
        it('should drop a collection that exists', (done) => {
            instance.dropCollection(collectionName).then(() => {
                return instance.getCollectionNames();
            }).then((list) => {
                expect(list).to.be.an('Array');
                expect(list.length).to.equal(0);
            }).then(done, done);
        });
    });

    describe('#truncateDatabase', () => {
        it('should truncate the current database', (done) => {
            instance.truncateDatabase().then((isSuccessful) => {
                expect(isSuccessful).to.equal(true);
            }).then(done, done);
        });
    });

    describe('#queryToAQL()', () => {
        for (const i in queries) {
            it('should parse query ' + queries[i].desc, () => {
                for (const j in queries[i].data) {
                    const q = instance.queryToAQL('collection', new Query(null, queries[i].data[j]));
                    expect(q).to.equal(queries[i].aql);
                }
            });
        }
    });
});