import 'mocha';
import {expect} from 'chai';
import {Container} from '../src';
import ArangoDBAdapter from 'nomatic-arangodb-adapter';
import people from './fixtures/data/people';
import accounts from './fixtures/data/accounts';
import Query from '../src/Query';
import {inspect} from 'util';

describe('Container', () => {
    const config = require('./fixtures/config/' + process.env.NODE_ENV + '.json')['arangodb'];
    let adapter;
    let instance;
    let gets = 0;

    before((done) => {
        adapter = new ArangoDBAdapter(config);
        adapter.getDatabaseNames().then((list) => {
            if (list.indexOf(config.name) !== -1) {
                return adapter.dropDatabase();
            }
        }).then(() => {
            return adapter.createDatabase();
        }).then(() => {
            adapter.name = config.name;

            instance = new Container({
                adapter: adapter,
                afterGet() {
                    gets++;
                },
                beforeInsert(record) {
                    record.createdAt = new Date();
                },
                beforeUpdate(record) {
                    record.updatedAt = new Date();
                },
                mappers: {
                    accounts: {
                        properties: {
                            people: {
                                type: 'array',
                                items: {
                                    type: 'string',
                                    mapper: 'people'
                                }
                            }
                        }
                    },
                    people: {
                        virtuals: {
                            name: {
                                get() {
                                    return `${this.firstName} ${this.lastName}`;
                                },
                                save: false,
                                serialize: false
                            }
                        },
                        properties: {
                            firstName: {
                                type: 'string',
                                minLength: 1
                            },
                            preferredName: {
                                type: 'string'
                            },
                            middleName: {
                                type: 'string'
                            },
                            lastName: {
                                type: 'string',
                                minLength: 1
                            },
                            maidenName: {
                                type: 'string'
                            }
                        },
                        required: ['firstName', 'lastName'],
                        additionalProperties: false
                    }
                }
            });

            expect(instance.isLoaded).to.equal(false);
            expect(instance.isLoading).to.equal(false);

            return instance.load().then(() => {
                return done();
            });
        }).catch(done);
    });

    describe('#isLoaded', () => {
        it('should return true when loaded', () => {
            expect(instance.isLoaded).to.equal(true);
        });
    });

    describe('#isLoading', () => {
        it('should return false when instance is loaded', () => {
            expect(instance.isLoading).to.equal(false);
        });
    });

    describe('#defineMapper()', () => {
        it('should correctly define a Mapper instance', () => {
            expect(instance.mappers['people']).to.have.keys([
                '_maxListeners',
                '_validate',
                '_virtuals',
                'adapter',
                'collection',
                'listeners',
                'name'
            ]);

            expect(instance.mappers['people']._virtuals.name.get.toString().split(' ').join(''))
                .to.equal('get(){\nreturn`${this.firstName}${this.lastName}`;\n}');

        });
    });

    describe('#insert()', () => {
        it('should insert a new record', (done) => {
            instance.insert('people', people[0]).then((record) => {
                expect(record.firstName).to.equal(people[0].firstName);
                expect(record.lastName).to.equal(people[0].lastName);
                expect(record._data).to.have.keys([
                    'firstName',
                    'middleName',
                    'lastName',
                    'id',
                    'rev',
                    'createdAt'
                ]);
                people[0] = record.serialize();
            }).then(done, done);
        });

        it('should insert a new record while specifying `id`', (done) => {
            instance.insert('people', people[1]).then((record) => {
                expect(record.id).to.equal(people[1]['id']);
                expect(record.firstName).to.equal(people[1].firstName);
                expect(record.lastName).to.equal(people[1].lastName);
                expect(record._data).to.have.keys([
                    'firstName',
                    'lastName',
                    'id',
                    'rev',
                    'createdAt'
                ]);
                people[1] = record.serialize();
            }).then(done, done);
        });

        it('should insert a new record that relates to a record in a different collection', (done) => {
            instance.insert('accounts', accounts[0]).then((record) => {
                expect(record.people).to.deep.equal(accounts[0].people);
                accounts[0] = record.serialize();
            }).then(done, done);
        });

        it('should throw when inserting a new record that relates to a record in a different collection which does not exist', (done) => {
            instance.insert('accounts', {
                people: [people[1]['id'], '00000000']
            }).then(() => {
                throw new Error('Did not throw!');
            }).catch((error) => {
                if (error.message.startsWith('should reference an existing record in')) {
                    return done();
                }

                return done(error);
            });
        });

        it('should throw when inserting a new record that fails validation', (done) => {
            instance.insert('people', {
                'firstName': 'Brian'
            }).then(() => {
                return done(new Error('Did not throw!'));
            }).catch((error) => {
                if (error.name === 'ValidationError' && error.message.startsWith('should have required property')) return done();
                throw error;
            });
        });
    });

    describe('#update()', () => {
        it('should update a record', (done) => {
            instance.update('accounts', accounts[0]['id'], {
                people: [people[0]['id']]
            }).then((record) => {
                return done();
            }).catch(done);
        });
    });

    describe('#findAll', () => {
        it('should return all results', (done) => {
            const startGets = gets;
            instance.findAll('people', {}).then((results) => {
                expect(results.length).to.equal(people.length);
                expect(gets).to.equal(startGets + results.length);
            }).then(done, done);
        });

        it('should find result where `firstName` is equal to ' + people[0].firstName, (done) => {
            instance.findAll('people', new Query(null, {
                $where: {
                    firstName: {
                        $eq: people[0].firstName
                    }
                }
            })).then((results) => {
                expect(results.length).to.equal(1);
                expect(results[0].id).to.equal(people[0]['id']);
            }).then(done, done);
        });

        it('should skip one person if `$skip` is 1', (done) => {
            instance.findAll('people', {
                $skip: 1
            }).then((results) => {
                expect(results.length).to.equal(1);
            }).then(done, done);
        });

        it('should return one record if `$skip` is 1 and `$limit` is also 1', (done) => {
            instance.findAll('people', {
                $skip: 1,
                $limit: 1
            }).then((results) => {
                expect(results.length).to.equal(1);
            }).then(done, done);
        });
    });

    describe('#get()', () => {
        it('should return a saved Record instance', (done) => {
            const startGets = gets;
            instance.get('people', people[0]['id']).then((result) => {
                expect(result.id).to.equal(people[0]['id']);
                expect(result.name).to.equal(`${people[0].firstName} ${people[0].lastName}`);
                expect(gets).to.equal(startGets + 1);
            }).then(done, done);
        });
    });

    describe('#getAll()', () => {
        it('should return an array of saved Record instances', (done) => {
            const startGets = gets;
            instance.getAll('people', [people[0]['id'], people[1]['id']]).then((results) => {
                expect(results.length).to.equal(2);
                expect(results[0].id).to.equal(people[0]['id']);
                expect(results[1].id).to.equal(people[1]['id']);
                expect(gets).to.equal(startGets + 2);
            }).then(done, done);
        });
    });

    describe('#insertAll()', () => {
        it('should insert a bunch of records', (done) => {
            instance.insertAll('people', [
                {firstName: 'Jennifer', lastName: 'Doe'},
                {firstName: 'Bob', lastName: 'Doe'}
            ]).then((results) => {
                expect(results.length).to.equal(2);
            }).then(done, done);
        });

        it('should throw when record already exists', (done) => {
            instance.insertAll('people', [
                people[1]
            ]).then(() => {
                throw new Error('Did not throw!')
            }).catch((e) => {
                if (e.name !== 'AlreadyExistsError') {
                    return done(e);
                }

                return done();
            });
        });
    });

    describe('#replace()', () => {
        it('should replace a record', (done) => {
            instance.replace('people', people[1]['id'], {
                firstName: 'Rebecca',
                lastName: 'Peterson'
            }).then((result) => {
                expect(result.id).to.equal(people[1]['id']);
                expect(result.firstName).to.equal('Rebecca');
                expect(result.lastName).to.equal('Peterson');
                expect(result.rev).to.not.equal(people[1]['rev']);
                people[1] = result;
            }).then(done, done);
        });
    });

    describe('#remove()', () => {
        it('should delete the saved record', (done) => {
            instance.remove('people', people[0]).then(() => {
                return instance.get('people', people[0]['id']).then(() => {
                    return done('Did not throw!')
                }).catch((e) => {
                    if (e.name === 'NotFoundError') {
                        return done();
                    }
                    return done(e);
                });
            }).catch(e => {
                console.log(inspect(e, true, Infinity));
                return done(e);
            });
        });

        it('should delete the saved Record when only passing `id`', (done) => {
            instance.remove('people', people[1]['id']).then(() => {
                return instance.get('people', people[1]['id']).then(() => {
                    return done('Did not throw!')
                }).catch((e) => {
                    if (e.name === 'NotFoundError') {
                        return done();
                    }
                    return done(e);
                });
            }).catch(e => {
                console.log(inspect(e, true, Infinity));
                return done(e);
            });
        });

        it('should throw when re-deleting saved Record', (done) => {
            instance.remove('people', people[0]['id']).then(() => {
                return done('Did not throw!');
            }).catch((e) => {
                if (e.name === 'NotFoundError') {
                    return done();
                }
                console.error(e);
                return done(e);
            });
        });
    });
});