import assert from 'node:assert/strict'
import React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {createJiti} from 'jiti'
const j=createJiti(import.meta.url,{jsx:{runtime:'automatic'},alias:{'@':new URL('../src',import.meta.url).pathname}})
const {WordTester}=await j.import('../src/components/WordTester.tsx')
const noop=()=>{}, base={activeChar:'a',activeFilled:new Map(),drafts:new Map(),grid:{cols:7,rows:9,cellSize:40,gap:2},library:[],softness:.55,cornerRadius:0,brokenJoins:new Set(),value:'',onValueChange:noop,onSelectChar:noop}
const render=p=>renderToStaticMarkup(React.createElement(WordTester,{...base,...p}))
const html=render({strokeActive:true})
for(const label of ['Specimen SVG','Glyph SVG','Alphabet SVG','Font OTF','Font WOFF'])assert.match(html,new RegExp(`<button disabled="">${label}</button>`))
assert.ok(!render({collapsed:true}).includes('<textarea'))
assert.match(render({}),/aria-expanded="true" disabled=""/)
const symbol={char:'𐐀',name:'Supplementary',updatedAt:'2026-10-09',deleted:false}
assert.match(render({value:'a'.repeat(1499),customSymbols:[symbol]}),/title="Insert Supplementary" disabled=""/)
assert.ok(!render({value:'a'.repeat(1498),customSymbols:[symbol]}).includes('title="Insert Supplementary" disabled'))
assert.ok(!render({customSymbols:[{...symbol,deleted:true}]}).includes('Insert Supplementary'))
console.log('WordTester release checks passed: stroke export lock, collapsed controls, absent toggle callback, supplementary insertion boundary, deleted symbols.')
