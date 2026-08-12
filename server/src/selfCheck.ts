import assert from 'assert';
import { extractVideoId, SimpleLRUCache } from './cacheManager';
import { vttToSrt } from './subtitleHelper';
import { fetchFreeProxyList } from './proxyFetcher';

async function runChecks() {
    console.log('[SelfCheck] Running SubStream AI Server Logic Checks...');

    // 1. Test Video ID Extractor
    assert.strictEqual(extractVideoId('rngWhACtDr0'), 'rngWhACtDr0');
    assert.strictEqual(extractVideoId('https://www.youtube.com/watch?v=rngWhACtDr0'), 'rngWhACtDr0');
    assert.strictEqual(extractVideoId('https://youtu.be/rngWhACtDr0?t=10'), 'rngWhACtDr0');
    assert.strictEqual(extractVideoId('https://www.youtube.com/embed/rngWhACtDr0'), 'rngWhACtDr0');
    assert.strictEqual(extractVideoId('https://www.youtube.com/shorts/rngWhACtDr0'), 'rngWhACtDr0');
    console.log('✓ extractVideoId passed');

    // 2. Test SimpleLRUCache
    const testCache = new SimpleLRUCache<string>(2, 5000);
    testCache.set('v1', 'meta1');
    testCache.set('v2', 'meta2');
    assert.strictEqual(testCache.get('v1'), 'meta1');

    testCache.set('v3', 'meta3');
    assert.strictEqual(testCache.get('v1'), 'meta1');
    assert.strictEqual(testCache.get('v3'), 'meta3');
    assert.strictEqual(testCache.get('v2'), null);
    console.log('✓ SimpleLRUCache passed');

    // 3. Test VTT to SRT converter
    const sampleVTT = `WEBVTT

00:00:01.500 --> 00:00:04.000
Hello world

00:00:04.100 --> 00:00:07.500
<c.colorFFF>SubStream AI</c>
`;

    const expectedSRT = `1
00:00:01,500 --> 00:00:04,000
Hello world

2
00:00:04,100 --> 00:00:07,500
SubStream AI`;

    assert.strictEqual(vttToSrt(sampleVTT).trim(), expectedSRT.trim());
    console.log('✓ vttToSrt passed');

    // 4. Test iplocate/free-proxy-list fetching
    console.log('Testing live fetch from iplocate/free-proxy-list repository...');
    const proxies = await fetchFreeProxyList();
    assert.ok(proxies.length > 0, 'Proxy list should contain fetched proxy candidates');
    console.log(`✓ Proxy fetcher passed (fetched ${proxies.length} proxies from repository)`);

    console.log('[SelfCheck] All checks passed successfully!');
}

runChecks().catch(err => {
    console.error('SelfCheck failed:', err);
    process.exit(1);
});
