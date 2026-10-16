const {test}=require('node:test');
const assert=require('node:assert/strict');
const {releaseEnvironment}=require('../scripts/build-release.cjs');
test('optional empty signing secrets are omitted instead of interpreted as certificate paths',()=>{
  const input={CSC_LINK:'',CSC_KEY_PASSWORD:' ',APPLE_ID:'',APPLE_APP_SPECIFIC_PASSWORD:'',APPLE_TEAM_ID:'',PATH:'fixture',GH_TOKEN:'fixture-token'};
  const env=releaseEnvironment(input);assert.ok(!Object.hasOwn(env,'CSC_LINK'));assert.ok(!Object.hasOwn(env,'APPLE_ID'));assert.equal(env.PATH,'fixture');assert.equal(env.GH_TOKEN,'fixture-token');assert.equal(input.CSC_LINK,'');
  assert.equal(releaseEnvironment({CSC_LINK:'certificate.p12',CSC_KEY_PASSWORD:'example'}).CSC_LINK,'certificate.p12');
});
