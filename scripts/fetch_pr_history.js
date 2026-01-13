import fs from 'fs';
import https from 'https';

const url = 'https://api.github.com/repos/kalepail/smol-fe/pulls?state=all&per_page=50&page=1';
const options = {
    headers: {
        'User-Agent': 'node.js'
    }
};

https.get(url, options, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        const prs = JSON.parse(data);
        const simplePrs = prs.map(pr => ({
            number: pr.number,
            title: pr.title,
            state: pr.state,
            merged_at: pr.merged_at,
            head: pr.head.label,
            base: pr.base.label
        }));
        fs.writeFileSync('pr_history.json', JSON.stringify(simplePrs, null, 2));
        console.log(`Fetched ${simplePrs.length} PRs.`);
    });
}).on('error', (err) => {
    console.error(err);
});
