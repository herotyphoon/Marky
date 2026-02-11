async function compress(text) {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(text);

    const stream = new CompressionStream('deflate-raw');

    const writer = stream.writable.getWriter();
    writer.write(bytes);
    writer.close();

    const buffer = await new Response(stream.readable).arrayBuffer();

    const compressedText = new Uint8Array(buffer).toBase64({ alphabet: 'base64url' });
    return compressedText;
}

async function decompress(compressedText) {
    if (!compressedText) return ''; 

    const bytes = Uint8Array.fromBase64(compressedText, { alphabet: 'base64url' });

    const stream = new DecompressionStream('deflate-raw');

    const writer = stream.writable.getWriter();
    writer.write(bytes); 
    writer.close();

    const buffer = await new Response(stream.readable).arrayBuffer();

    const text = new TextDecoder().decode(buffer);
    return text;
}

async function set(hash) {
    const content = await decompress(hash.slice(1));
    editor.textContent = content
}

async function get() {
    const content = editor.textContent;

    const hash = '#' + await compress(content);
    return hash;
}

async function save() {
    const hash = await get();

    if (location.hash !== hash) {
        history.replaceState({}, '', hash);
        try {
            localStorage.setItem('hash', hash);
        } catch (e) {
            console.error('Failed to save to localStorage:', e);
        }
    }
}

async function load() {
    try {
        let content = '';

        if (location.hash && location.hash.length > 1) {
            content = await decompress(location.hash.slice(1));
        } else {
            const storedHash = localStorage.getItem('hash');
            if (storedHash) {
                content = await decompress(storedHash.slice(1));
            }
        }

        if (content) {
            editor.textContent = content;

            const tokens = tokenizer(content);
            preview.innerHTML = parser(tokens);
            updatePageTitleFromTokens(tokens);

            editor.style.display = 'none';
            preview.style.removeProperty('display');

            previewBtn.classList.add('active');
            editorBtn.classList.remove('active');
        } else {
            preview.style.display = 'none';
            editor.style.removeProperty('display');

            editorBtn.classList.add('active');
            previewBtn.classList.remove('active');

            editor.focus();
        }

    } catch (e) {
        console.error("Load failed:", e);

        preview.style.display = 'none';
        editor.style.removeProperty('display');
    }
}

function debounce(ms, func) {
    let timer;

    const debouncedFunc = (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => func(...args), ms)
    }
    return debouncedFunc;
}

function escapeHTML(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function normalizeURL(url) {
    let trimmed = url.trim();

    if (/^(https?:\/\/|mailto:|tel:)/i.test(trimmed)) {
        return trimmed;
    }

    if (/^\/\//.test(trimmed)) {
        return 'https:' + trimmed;
    }

    return 'https://' + trimmed;
}

function inLineParser(line) {
    let result = escapeHTML(line);

    const escapes = [];
    result = result.replace(/\\(.)/g, (m, char) => {
        escapes.push(char);
        return `%%ESC${escapes.length - 1}%%`;
    });

    result = result.replace(
        /(^|\s)((https?:\/\/|www\.)[^\s<]+)/g,
        (m, prefix, url) => {
            const href = normalizeURL(url);
            return `${prefix}<a href="${href}" target="_blank" rel="noopener noreferrer">${url}</a>`;
        }
    );    

    result = result.replace(/!\[(.*?)\]\((.*?)\)/g, (m, alt, src) => {
        return `<img src="${src}" alt="${alt}" />`;
    });    
    result = result.replace(/\[(.+?)\]\((.+?)\)/g, (m, text, url) => {
        const safeURL = normalizeURL(url);
        return `<a href="${safeURL}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    });    

    result = result.replace(/~~(.+?)~~/g, (m,c)=>`<del>${c}</del>`);
    result = result.replace(/__(.+?)__/g, (m,c)=>`<u>${c}</u>`);

    result = result.replace(/\*\*(.+?)\*\*/g, (m,c)=>`<strong>${c}</strong>`);
    result = result.replace(/\*(.+?)\*/g, (m,c)=>`<em>${c}</em>`);

    result = result.replace(/`(.+?)`/g, (m,c)=>`<code>${c}</code>`);

    result = result.replace(/%%ESC(\d+)%%/g, (m, i) => escapes[i]);

    return result;
}

function tokenizer(text) {
    const lines = text.split('\n');
    const tokens = [];
    let paragraphBuffer = [];
    let i = 0;

    const cont = { state:false, type:'', endOn:'', value:null };

    function flushParagraph() {
        if (paragraphBuffer.length) {
            tokens.push({
                type: 'p',
                content: paragraphBuffer.join(' ')
            });
            paragraphBuffer = [];
        }
    }

    function indentLevel(line) {
        const indent = line.match(/^\s*/)[0];
        return indent.replace(/\t/g, '    ').length;
    }

    function parseNestedList(startIndent) {
        const items = [];

        while (i < lines.length) {
            const raw = lines[i];
            const indent = indentLevel(raw);
            const line = raw.trimLeft();

            if (indent < startIndent) break;

            const matchUL = line.match(/^[-+]\s+(.*)/);
            const matchOL = line.match(/^(\d+)\.\s+(.*)/);

            if (!matchUL && !matchOL) break;

            const content = matchUL ? matchUL[1] : matchOL[2];

            i++;

            let children = [];
            if (i < lines.length && indentLevel(lines[i]) >= indent + 4) {
                children = parseNestedList(indentLevel(lines[i]));
            }

            items.push({ content, children });
        }

        return [{
            type: 'list',
            ordered: /^\s*\d+\./.test(lines[i-1]),
            items
        }];
    }

    function parseNestedBlockquote() {
        const collected = [];

        while (i < lines.length && lines[i].trimLeft().startsWith('>')) {
            const line = lines[i].replace(/^\s*>+\s?/, '');
            collected.push(line);
            i++;
        }

        return {
            type:'blockquote',
            content: tokenizer(collected.join('\n'))
        };
    }

    while (i < lines.length) {
        let rawLine = lines[i];
        let line = rawLine.trimLeft();

        if (cont.state && cont.type === 'codeblock') {
            if (line.startsWith(cont.endOn)) {
                tokens.push(cont.value);
                cont.state = false;
                cont.value = null;
            } else {
                cont.value.content += line + '\n';
            }
            i++;
            continue;
        }

        if (line.startsWith('```')) {
            flushParagraph();
            cont.state = true;
            cont.type = 'codeblock';
            cont.endOn = '```';
            cont.value = { type:'codeblock', lang:line.slice(3).trim(), content:'' };
            i++;
            continue;
        }

        if (
            i + 1 < lines.length &&
            line.includes('|') &&
            /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(lines[i + 1])
        ) {
            flushParagraph();
        
            const headerLine = lines[i];
            const alignLine = lines[i + 1];
            i += 2;
        
            const rows = [];
        
            while (i < lines.length && lines[i].includes('|')) {
                rows.push(lines[i]);
                i++;
            }
        
            tokens.push({
                type: 'table',
                header: headerLine,
                align: alignLine,
                rows
            });
        
            continue;
        }

        if (line.startsWith('>')) {
            flushParagraph();
            tokens.push(parseNestedBlockquote());
            continue;
        }

        if (/^\s*([-+]|\d+\.)\s+/.test(rawLine)) {
            flushParagraph();
            tokens.push(...parseNestedList(indentLevel(rawLine)));
            continue;
        }

        if (/^\s*((-\s*){3,}|(\*\s*){3,}|(_\s*){3,})\s*$/.test(line)) {
            flushParagraph();
            tokens.push({ type:'hr' });
            i++;
            continue;
        }

        if (line.startsWith('###### ')) { flushParagraph(); tokens.push({type:'h6',content:line.slice(7)}); }
        else if (line.startsWith('##### ')) { flushParagraph(); tokens.push({type:'h5',content:line.slice(6)}); }
        else if (line.startsWith('#### ')) { flushParagraph(); tokens.push({type:'h4',content:line.slice(5)}); }
        else if (line.startsWith('### ')) { flushParagraph(); tokens.push({type:'h3',content:line.slice(4)}); }
        else if (line.startsWith('## ')) { flushParagraph(); tokens.push({type:'h2',content:line.slice(3)}); }
        else if (line.startsWith('# ')) { flushParagraph(); tokens.push({type:'h1',content:line.slice(2)}); }

        else if (line === '') {
            flushParagraph();
        }

        else {
            paragraphBuffer.push(line);
        }

        i++;
    }

    if (cont.state && cont.type==='codeblock') tokens.push(cont.value);

    flushParagraph();

    return tokens;
}

function parser(tokens) {
    const preview = tokens.map(token => {

        if (token.type === 'list') {

            const tag = token.ordered ? 'ol' : 'ul';

            const renderItems = (items) => {
                return items.map(item => {
                    let html = `<li>${inLineParser(item.content)}`;

                    if (item.children && item.children.length) {
                        html += parser(item.children);
                    }

                    html += `</li>`;
                    return html;
                }).join('');
            };

            return `<${tag}>${renderItems(token.items)}</${tag}>`;
        }

        else if (token.type === 'table') {

            const alignments = token.align
                .split('|')
                .filter(Boolean)
                .map(cell => {
                    cell = cell.trim();
                    if (cell.startsWith(':') && cell.endsWith(':')) return 'center';
                    if (cell.endsWith(':')) return 'right';
                    if (cell.startsWith(':')) return 'left';
                    return 'left';
                });
        
            const headerCells = token.header
                .split('|')
                .filter(Boolean)
                .map((c, i) => `<th style="text-align:${alignments[i]}">${inLineParser(c.trim())}</th>`)
                .join('');
        
            const bodyRows = token.rows.map(r => {
                const cells = r.split('|')
                    .filter(Boolean)
                    .map((c, i) => `<td style="text-align:${alignments[i]}">${inLineParser(c.trim())}</td>`)
                    .join('');
        
                return `<tr>${cells}</tr>`;
            }).join('');
        
            return `<table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table>`;
        }                      

        else if (token.type === 'codeblock') {
            return `<pre><code class="${token.lang}">${escapeHTML(token.content)}</code></pre>`;
        }

        else if (token.type === 'blockquote') {
            return `<blockquote>${parser(token.content)}</blockquote>`;
        }

        else if (token.type === 'br') return `<br>`;

        else if (token.type === 'hr') return `<hr>`;

        else return `<${token.type}>${inLineParser(token.content)}</${token.type}>`;
    });

    return preview.join('');
}

function updatePageTitleFromTokens(tokens) {
    const first = tokens.find(t => t.type !== 'br');

    if (first && first.type === 'h1') {
        const temp = document.createElement('div');
        temp.innerHTML = inLineParser(first.content);
        document.title = temp.textContent.trim() || 'Marky';
    } else {
        document.title = 'Marky';
    }
}

const editor = document.querySelector('.editor');
const preview = document.querySelector('.preview');
const editorBtn = document.querySelector('.editor-btn');
const previewBtn = document.querySelector('.preview-btn');
let cachedText = editor.textContent;

editor.addEventListener('input', debounce(500, save));

editorBtn.addEventListener('click', () => {
    try {
        preview.style.display = 'none';
        editor.style.removeProperty('display');
    } catch (e) {
    }

    editorBtn.classList.add('active');
    previewBtn.classList.remove('active');

    editor.focus();

    const range = document.createRange();
    const sel = window.getSelection();
    range.selectNodeContents(editor);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);

});

previewBtn.addEventListener('click', () => {
    try {
        editor.style.display = 'none';
        preview.style.removeProperty('display');
    } catch (e) {
    }

    previewBtn.classList.add('active');
    editorBtn.classList.remove('active');

    cachedText = editor.textContent;
    const tokens = tokenizer(editor.textContent);
    preview.innerHTML = parser(tokens);
});

editor.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
        e.preventDefault();

        const sel = window.getSelection();
        const range = sel.getRangeAt(0);

        const tabNode = document.createTextNode('\t');

        range.insertNode(tabNode);

        range.setStartAfter(tabNode);
        range.setEndAfter(tabNode);
        sel.removeAllRanges();
        sel.addRange(range);
    }
});

editor.addEventListener('input', debounce(500, () => {
    const tokens = tokenizer(editor.textContent);
    updatePageTitleFromTokens(tokens);
}));

load();