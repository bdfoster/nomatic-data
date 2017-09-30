import 'mocha';
import {expect} from 'chai';
import {Record, RecordData} from '../src';

describe('Record', () => {
    let number = 100;
    let saved = false;
    let instance: Record;
    let data = {
        id: '12345',
        rev: '0',
        firstName: 'John',
        lastName: 'Doe'
    };

    before(() => {
        instance = new Record({
            save(data: RecordData) {
                return new Promise((resolve) => {
                    this.emit('saved', data);
                    resolve(true);
                });
            },
            validate(data: RecordData) {
                return new Promise((resolve) => {
                    if (data.throw) throw new Error('thrown!');
                    this.emit('validated');
                    resolve();
                })
            },
            virtuals: {
                hello() {
                    return 'world'
                },
                number: {
                    get() {
                        return number;
                    },
                    set(value) {
                        number = value;
                    }
                },
                saved: {
                    get() {
                        return saved === true ? 'yes' : 'no';
                    },
                    set(value) {
                        saved = value;
                    },
                    save: true,
                    serialize: false
                }
            }
        }, {});
    });

    it('should not throw on instantiation with no parameters defined', () => {
        expect(new Record({})).to.not.throw;
    });

    it('should throw when trying to delete a property defined in proto', () => {
        try {
            delete instance['_data'];
        } catch (e) {
            if (e.name !== 'TypeError') throw e;
        }
    });

    it('should retrieve value of virtual property', () => {
        expect(instance.hello).to.equal('world');
        expect(instance.number).to.equal(100);
    });

    describe('#init()', () => {
        it('should properly initialize the instance', () => {
            expect(instance.init(Object.assign({}, data))).to.not.throw;
            expect(instance['_data']).to.deep.equal(Object.assign({}, data, {
                saved: 'no'
            }));
        });

        it('should clone if an existing Record instance is passed as `data`', () => {
            const clone = new Record(instance);
            expect(clone).to.deep.equal(instance);
            expect(clone).to.not.equal(instance);
        });
    });

    describe('#changes()', () => {
        it('should list changes', () => {
            expect(instance.changes().length).to.equal(0);
            instance.test = true;
            expect(instance.changes().length).to.equal(1);
            instance.test = false;
            expect(instance.changes().length).to.equal(2);
            instance.test = [];
            expect(instance.changes().length).to.equal(3);
            instance.test.push(1);
            expect(instance.changes().length).to.equal(4);
            instance.test.push(2);
            instance.test.pop();
            instance.test = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
            expect(instance.changes().length).to.equal(7);
        });

        it('should not list changes of a virtual property by default', () => {
            const start = instance.changes().length;
            instance.number = 5;
            expect(instance.changes().length).to.equal(start);
            expect(instance.number).to.equal(5);
        });

        it('should list changes of a virtual property if `save` is true', () => {
            instance.saved = true;
            expect(instance.changes(1)[0]).to.deep.equal({
                operation: 'replace',
                key: 'saved',
                old: 'no',
                new: 'yes'
            });
        });
    });

    describe('#revert()', () => {
        it('should revert changes to a string property', () => {
            const oldVal = 'John';
            const newVal = 'Joe';
            instance.firstName = oldVal;
            instance.firstName = 'Joe';
            expect(instance.firstName).to.equal(newVal);
            expect(instance.firstName).to.not.equal(oldVal);
            instance.revert(1);
            expect(instance.firstName).to.equal(oldVal);
        });

        it('should revert changes to an array', () => {
            instance.arr = [];
            instance.revert(1);
            expect(instance.arr).to.not.exist;
            instance.arr = [];
            instance.arr.push(1);
            instance.arr[1] = 'hello';
            instance.arr[1] = 'goodbye';
            instance.revert(1);
            expect(instance.arr[1]).to.equal('hello');
            instance.arr = [0, 1, 2, 3, 4, 5, 6, 7, 8];
            instance.revert(1);
            expect(instance.arr).to.deep.equal([1, 'hello']);
        });

        it('should revert changes to an object', () => {
            instance.obj = {};
            instance.revert(1);
            expect(instance.obj).to.not.exist;
            instance.obj = {
                hello: 'world',
                one: 1,
                test: true
            };
            instance.obj['two'] = 2;
            expect(instance.obj).to.deep.equal({
                hello: 'world',
                one: 1,
                test: true,
                two: 2
            });
            instance.obj = {tryAgain: true};
            instance.revert(2);
            expect(instance.obj).to.have.keys(['hello', 'one', 'test']);
            expect(instance.obj.two).to.not.exist;
            delete instance.obj.one;
            expect(instance.obj.one).to.not.exist;

            try {
                delete instance.obj.one;
            } catch (e) {
                if (e.name !== 'TypeError') throw e;
            }

            instance.revert(1);
            expect(instance.obj.one).to.equal(1);
        });

        it('should revert all changes', () => {
            instance.revert();

            expect(instance.changes().length).to.equal(0);
            expect(instance['_data']).to.deep.equal(Object.assign({}, data, {
                saved: 'no'
            }));
        });

        it('should not throw when there are no changes to revert and `count` is not specified', () => {
            expect(instance.revert()).to.not.throw;
        });
    });

    describe('#save()', () => {
        it('should call save handler and reset changes', (done) => {
            let emitted = false;

            instance.on('saved', () => {
                emitted = true;
            });
            instance.save().then(() => {
                expect(emitted).to.equal(true);
                expect(instance.changes().length).to.equal(0);
            }).then(done, done);

            setTimeout(() => {
                return done('Did not emit!');
            }, 200);
        });

        it('should not commit changes if save handler is not defined', () => {
            const i = new Record({});
            i.test = 1;
            expect(i.changes().length).to.equal(1);
            return i.save().then(() => {
                expect(i.test).to.equal(1);
                expect(i.changes().length).to.equal(1);
            });
        });
    });

    describe('#validate()', () => {
        it('should call validate handler', (done) => {
            let emitted = false;
            instance.on('validated', () => {
                emitted = true;
            });

            instance.validate().then(() => {
                if (emitted) return done();

                return done('Did not emit!');
            });

            setTimeout(() => {
                return done('Did not emit!');
            }, 200);
        });

        it('should not throw if validate handler is not defined', () => {
            const i = new Record({});
            return i.validate();
        });
    });

    describe('#toJSON()', () => {
        it('should only return virtual property values where `serialize` is true in definition', () => {
            const result = instance.toJSON();
            console.log(result);
            expect(result.saved).to.not.exist;
        });
    });

    describe('#serialize()', () => {
        it('should only return virtual property values matching `save` condition', () => {
            const result = instance.serialize('save');
            console.log(result);
            expect(result.saved).to.exist;
        });
    });
});