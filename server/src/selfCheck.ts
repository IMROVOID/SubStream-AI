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

    // 5. Test Caption Deduplication Logic
    const rawAutoCaptions: Record<string, any[]> = {
      'en-orig': [{ name: 'English (Original)', ext: 'vtt', url: 'https://youtube.com/sub/en-orig' }],
      'en': [{ name: 'English', ext: 'vtt', url: 'https://youtube.com/sub/en' }],
      'fa': [{ name: 'Persian', ext: 'vtt', url: 'https://youtube.com/sub/fa' }]
    };
    const seenKeys = new Set<string>();
    const testCaptions: any[] = [];
    const keys = Object.keys(rawAutoCaptions).sort((a, b) => {
      if (a.endsWith('-orig') && !b.endsWith('-orig')) return -1;
      if (!a.endsWith('-orig') && b.endsWith('-orig')) return 1;
      return a.localeCompare(b);
    });
    keys.forEach(lang => {
      let name = rawAutoCaptions[lang][0].name.replace(/\s*\(Original\)/i, '').trim();
      const baseLang = lang.replace(/-orig$/, '');
      const uniqueKey = `${baseLang}-auto`;
      if (!seenKeys.has(uniqueKey)) {
        seenKeys.add(uniqueKey);
        testCaptions.push({ language: baseLang, name: `${name} (Auto)` });
      }
    });
    assert.strictEqual(testCaptions.length, 2);
    assert.strictEqual(testCaptions[0].language, 'en');
    assert.strictEqual(testCaptions[0].name, 'English (Auto)');
    assert.strictEqual(testCaptions[1].language, 'fa');
    console.log('✓ Caption deduplication passed');

    console.log('[SelfCheck] All checks passed successfully!');
}

runChecks().catch(err => {
    console.error('SelfCheck failed:', err);
    process.exit(1);
});
