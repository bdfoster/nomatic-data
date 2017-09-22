import 'mocha';
import {expect} from 'chai';
import {Mapper, Record} from '../src';
import * as util from 'util';
import NotFoundError from '../src/errors/NotFoundError';
import ArangoDBAdapter from '../src/adapters/ArangoDBAdapter';

process.on('unhandledRejection', (reason) => {
    console.error(reason);
    process.exit(1);
});

describe('Mapper', () => {
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
            records[0].save().then(() => {
                expect(records[0].id).to.exist;
                expect(records[0].rev).to.exist;
                data[0] = records[0].toJSON();
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
            records[0].birthDate = '2000-12-31';
            records[0].save().then(() => {
                expect(data[0]['rev']).to.not.equal(records[0].rev);
                expect(records[0].birthDate).to.equal('2000-12-31');
                data[0] = records[0].toJSON();
            }).then(done, done);
        });

        it('should bypass database operations when no changes are made', (done) => {
            expect(records[0].changes().length).to.equal(0);
            records[0].save().then(() => {
                expect(data[0]['rev']).to.equal(records[0].rev);
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
            people.findAll({
                $where: {
                    id: records[0].id
                }
            }).then(results => {
                expect(results[0].serialize()).to.deep.equal(records[0].serialize());
                return done();
            }).catch(done);
        });
    });

    describe('#get()', () => {
        it('should get the saved Record', (done) => {
            people.get(data[0]['id']).then((record) => {
                expect(record).to.exist;
                expect(record).to.be.instanceOf(Record);
                expect(record.id).to.equal(records[0].id);
                return done();
            }).catch(done);
        });

        it('should throw when specifying a non-existent Record', (done) => {
            people.get('000000').then(() => {
                return done('Did not throw!');
            }).catch((e) => {
                if (e.name === 'NotFoundError') {
                    return done();
                }

                return done(e);
            });
        });
    });

    describe('#update()', () => {
        it('should update record given `data` is not a Record instance', (done) => {
            const data = records[0].serialize();

            data.middleName = 'David';
            people.update(data).then((result) => {
                expect(result.middleName).to.equal(data.middleName);
                expect(result.rev).to.not.equal(data.rev);
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

    describe('#remove()', () => {
        it('should delete the saved Record', (done) => {
            people.remove(data[0]).then(() => {
                return people.get(data[0]['id']).then(() => {
                    return done('Did not throw!')
                }).catch((e) => {
                    if (e.name === 'NotFoundError') {
                        return done();
                    }
                    return done(e);
                });
            }).catch(e => { console.log(util.inspect(e, true, Infinity)); return done(e); });
        });

        it('should delete the saved Record when only passing `id`', (done) => {
            people.remove(data[1]['id']).then(() => {
                return people.get(data[1]['id']).then(() => {
                    return done('Did not throw!')
                }).catch((e) => {
                    if (e.name === 'NotFoundError') {
                        return done();
                    }
                    return done(e);
                });
            }).catch(e => { console.log(util.inspect(e, true, Infinity)); return done(e); });
        });

        it('should throw when re-deleting saved Record', (done) => {
            people.remove(data[0]['id']).then(() => {
                return done('Did not throw!');
            }).catch((e) => {
                if (e instanceof NotFoundError) {
                    return done();
                }
                console.error(e);
                return done(e);
            });
        });
    });
});