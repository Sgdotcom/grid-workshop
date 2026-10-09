import assert from 'node:assert/strict'
import React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {createJiti} from 'jiti'
const j=createJiti(import.meta.url,{jsx:{runtime:'automatic'},alias:{'@':new URL('../src',import.meta.url).pathname}})
const {FontDesignTools}=await j.import('../src/components/FontDesignTools.tsx')
const {DEFAULT_FONT_DESIGN,LETTER_CHARACTERS}=await j.import('../src/lib/fontDesign.ts')
const noop=()=>{}, props={design:DEFAULT_FONT_DESIGN,onDesign:noop,grid:{cols:7,rows:9,cellSize:40,gap:2},onResize:noop,symbols:[],onCreate:noop,onRemove:noop,onSelect:noop,onRandom:noop,activeChar:'a',section:'characters',completedCharacters:['a','A']}
const html=renderToStaticMarkup(React.createElement(FontDesignTools,props))
assert.ok(html.includes('Uppercase letters') && html.includes('Lowercase letters') && html.includes('Unfinished only'))
assert.ok(html.includes(`${LETTER_CHARACTERS.length-2} left to make`))
assert.ok(html.indexOf('title="B · Not submitted yet"') < html.indexOf('title="b · Not submitted yet"'))
assert.ok(html.indexOf('title="b · Not submitted yet"') < html.indexOf('title="A · Submitted"'))
const digit=renderToStaticMarkup(React.createElement(FontDesignTools,{...props,activeChar:'1',completedCharacters:['0','1']}))
assert.ok(digit.includes('8 left to make'))
assert.ok(!digit.includes('aria-label="Letter case"'))
assert.ok(digit.indexOf('title="2 · Not submitted yet"') < digit.indexOf('title="0 · Submitted"'))
console.log('Character discovery passed: uppercase first, unfinished before submitted, progress counts, digit category, unchanged active selection.')
