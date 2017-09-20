import 'mocha';
import {expect} from 'chai';
import {ArangoDBAdapter, Container} from '../src';
import people from './fixtures/data/people';
import accounts from './fixtures/data/accounts';
import {RecordData} from '../src/Record';
import Query from '../src/Query';
import queries from './fixtures/queries';
import {inspect} from 'util';

describe('Container', () => {
    const config = require('./fixtures/config/' + process.env.NODE_ENV + '.json')['arangodb'];
    let adapter;
    let instance;

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
                people[0] = record;
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
                people[1] = record;
            }).then(done, done);
        });

        it('should insert a new record that relates to a record in a different collection', (done) => {
            instance.insert('accounts', accounts[0]).then((record) => {
                expect(record.people).to.deep.equal(accounts[0].people);
            }).then(done, done);
        });

        it('should throw when inserting a new record that relates to a record in a different collection which does not exist', (done) => {
            instance.insert('accounts', {
                people: [people[1]['id'], '00000000']
            }).then(() => {
                throw new Error('Did not throw!');
            }).catch((error) => {
                if (error.message.startsWith('should be an existing')) {
                    return done();
                }

                return done(error);
            });
        });
    });


});