// write a mocha chai typescript hello world test
import { expect } from 'chai';

// there must be on test to pass CI
describe('tests', () => {
  it('should run', () => {
    expect(true).to.be.true;
  });
});