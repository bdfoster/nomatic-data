import 'mocha';
import {expect} from 'chai';
import {Mapper, Record} from '../src';
import NotFoundError from '../src/errors/NotFoundError';
import ArangoDBAdapter from 'nomatic-arangodb-adapter';

process.on('unhandledRejection', (reason) => {
    console.error(reason);
    process.exit(1);
});

describe('Mapper', () => {
    let hooksFired = [];
    const records = [];
    const data = [
        {
            firstName: 'John',
            lastName: 'Doe'

        },

        {
            id: '12345',
            firstName: 'Jane',
            lastName: 'Doe',
            birthDate: '1989-01-01'
        }

    ];

    let people: Mapper;

    before(function (done) {
        let config = require('./fixtures/config/' + process.env.NODE_ENV + '.json')['arangodb'];
        people = new Mapper({
            adapter: new ArangoDBAdapter(config),
            name: 'person',
            afterGet: (record) => {
                expect(record).to.be.an.instanceOf(Record);
                hooksFired.push('afterGet');
            },
            afterInsert: (record) => {
                expect(record).to.be.an.instanceOf(Record);
                hooksFired.push('afterInsert');
            },
            afterUpdate: (record) => {
                expect(record).to.be.an.instanceOf(Record);
                hooksFired.push('afterUpdate');
            },
            afterValidate: (record) => {
                expect(record).to.be.an.instanceOf(Record);
                hooksFired.push('afterValidate');
            },
            beforeGet: (id) => {
                expect(id).to.be.a('string');
                hooksFired.push('beforeGet');
            },
            beforeInsert: (record) => {
                expect(record).to.be.an.instanceOf(Record);
                hooksFired.push('beforeInsert');
            },
            beforeUpdate: (record) => {
                expect(record).to.be.an.instanceOf(Record);
                hooksFired.push('beforeUpdate');
            },
            beforeValidate: (record) => {
                expect(record).to.be.an.instanceOf(Record);
                hooksFired.push('beforeValidate');
            }
        });
        people.load().then(() => {
            return people.truncate().then(() => {
                records.push(people.createRecord(data[0]));
                records.push(people.createRecord(data[1]));
                return done();
            });
        }).catch(done);
    });

    describe('#create()', () => {
        it('should create a new Record', () => {
            expect(records[0]).to.be.instanceOf(Record);
            expect(records[0]['_data']).to.deep.equal(data[0]);
        });

        it('should create a new Record when specifying `id`', () => {
            expect(records[1].id).to.equal(data[1]['id']);
            expect(records[1].toJSON()).to.deep.equal(data[1]);
            expect(records[1].rev).to.not.exist;
        });
    });

    describe('#save()', () => {
        it('should save the record to the database collection when `id` is not specified', (done) => {
            hooksFired = [];
            records[0].save().then(() => {
                expect(records[0].id).to.exist;
                expect(records[0].rev).to.exist;
                data[0] = records[0].toJSON();
                expect(hooksFired).to.deep.equal([
                    'beforeValidate',
                    'afterValidate',
                    'beforeInsert',
                    'afterInsert',
                    'afterGet'
                ]);
            }).then(done, done);
        });

        it('should save the record to the database collection when `id` is specified', (done) => {
            records[1].save().then(() => {
                expect(records[1].id).to.equal(data[1]['id']);
                expect(records[1].rev).to.exist;
                data[1] = records[1].toJSON();
            }).then(done, done);
        });

        it('should update the record to the database collection', (done) => {
            hooksFired = [];
            records[0].birthDate = '2000-12-31';
            records[0].save().then(() => {
                expect(data[0]['rev']).to.not.equal(records[0].rev);
                expect(records[0].birthDate).to.equal('2000-12-31');
                data[0] = records[0].toJSON();
                expect(hooksFired).to.deep.equal([
                    'beforeValidate',
                    'afterValidate',
                    'beforeUpdate',
                    'afterUpdate',
                    'afterGet'
                ]);
            }).then(done, done);
        });

        it('should bypass database operations when no changes are made', (done) => {
            hooksFired = [];
            expect(records[0].changes().length).to.equal(0);
            records[0].save().then(() => {
                expect(data[0]['rev']).to.equal(records[0].rev);
                expect(hooksFired).to.deep.equal([
                    'beforeGet',
                    'afterGet'
                ]);
            }).then(done, done);
        });

        it('should force database operations when no changes are made and `force` is true', (done) => {
            hooksFired = [];
            expect(records[0].changes().length).to.equal(0);
            people.save(records[0], false, true).then(() => {
                expect(data[0]['rev']).to.not.equal(records[0].rev);
                data[0] = records[0].toJSON();
                expect(hooksFired).to.deep.equal([
                    'beforeUpdate',
                    'afterUpdate',
                    'afterGet'
                ]);
            }).then(done, done);
        });

        it('should throw if trying to use an id that already exists', (done) => {
            const d = {
                id: records[0].id,
                firstName: 'Jane',
                lastName: 'Doe',
                birthDate: '1989-01-01'
            };

            const record = people.createRecord(d);

            record.save().then(() => {
                return done('Did not throw!');
            }).catch((e) => {
                if (e.name === 'AlreadyExistsError') {
                    return done();
                }

                return done(e);
            });
        });
    });

    describe('#findAll', () => {
        it('should find the saved Record', (done) => {
            hooksFired = [];
            people.findAll({
                $where: {
                    id: records[0].id
                }
            }).then(results => {
                expect(results[0].serialize()).to.deep.equal(records[0].serialize());
                expect(hooksFired).to.deep.equal([
                    'afterGet'
                ]);
            }).then(done, done);
        });
    });

    describe('#get()', () => {
        it('should get the saved Record', (done) => {
            hooksFired = [];
            people.get(data[0]['id']).then((record) => {
                expect(record).to.exist;
                expect(record).to.be.instanceOf(Record);
                expect(record.id).to.equal(records[0].id);
                expect(hooksFired).to.deep.equal([
                    'beforeGet',
                    'afterGet'
                ]);
                return done();
            }).catch(done);
        });

        it('should throw when specifying a non-existent Record', (done) => {
            hooksFired = [];
            people.get('000000').then(() => {
                return done('Did not throw!');
            }).catch((e) => {
                if (e.name === 'NotFoundError') {
                    expect(hooksFired).to.deep.equal([
                        'beforeGet'
                    ]);
                    return done();
                }

                return done(e);
            });
        });
    });

    describe('#getAll()', () => {
        it('should get an array with one saved Record instance', (done) => {
            people.getAll([data[0]['id']]).then((results) => {
                expect(results).to.exist;
                expect(results.length).to.equal(1);
                expect(results[0].id).to.equal(records[0].id);
                expect(results[0].rev).to.equal(records[0].rev);
            }).then(done, done);
        });
    });

    describe('#update()', () => {
        it('should update record given `data` is not a Record instance', (done) => {
            const data = records[0].serialize();
            hooksFired = [];
            data.middleName = 'David';
            people.update(data).then((result) => {
                expect(result.middleName).to.equal(data.middleName);
                expect(result.rev).to.not.equal(data.rev);
                expect(result).to.be.an.instanceOf(Record);
                records[0] = result;
                expect(hooksFired).to.deep.equal([
                    'beforeGet',
                    'afterGet',
                    'beforeValidate',
                    'afterValidate',
                    'beforeUpdate',
                    'afterUpdate',
                    'afterGet'
                ]);
            }).then(done, done);
        });

        it('should update record when a property is set to null', (done) => {
            const oldRev = records[0].rev;
            records[0].middleName = null;
            people.update(records[0]).then((result) => {
                expect(result.middleName).to.not.exist;
                expect(result.rev).to.not.equal(oldRev);
                expect(result).to.be.an.instanceOf(Record);
                records[0] = result;
            }).then(done, done);
        });

        it('should throw if revision is invalid', (done) => {
            const rev = '_Vaactly---';
            records[0].rev = rev;
            records[0]['middleName'] = 'Richard';
            people.update(records[0]).then(() => {
                return done('Did not throw!');
            }).catch(e => {
                if (e.name === 'AssertionError' && e.message.startsWith('Assertion Error: expected `rev` to equal `' + rev)) {
                    return done();
                }
                return done(e);
            });
        });
    });
});