#!/usr/bin/env node

const path = require('path')
const fs = require('fs')
const gzSize = require('gzip-size')
const mkdirp = require('mkdirp')

// first we check to make sure that the `.next` directory exists
const nextMetaRoot = path.join(process.cwd(), '.next')
try {
  fs.accessSync(nextMetaRoot, fs.constants.R_OK)
} catch (err) {
  console.error(
    `No ".next" directory found at "${nextMetaRoot}" - you may not have your working directory set correctly, or not have run "next build".`
  )
  process.exit(1)
}

// if so, we can import the build manifest
const buildMeta = require(path.join(process.cwd(), '.next/build-manifest.json'))

// this memory cache ensures we dont read any script file more than once
// bundles are often shared between pages
const memoryCache = {}

// since _app is the template that all other pages are rendered into,
// every page must load its scripts. we'll measure its size here
const globalBundle = buildMeta.pages['/_app']
const globalBundleSizes = getScriptSizes(globalBundle)

// next, we calculate the size of each page's scripts, after
// subtracting out the global scripts
const allPageSizes = Object.values(buildMeta.pages).reduce(
  (acc, scriptPaths, i) => {
    const pagePath = Object.keys(buildMeta.pages)[i]
    const scriptSizes = getScriptSizes(
      scriptPaths.filter((scriptPath) => !globalBundle.includes(scriptPath))
    )

    acc[pagePath] = scriptSizes
    return acc
  },
  {}
)

// format and write the output
const rawData = JSON.stringify({
  ...allPageSizes,
  __global: globalBundleSizes,
})

// log ouputs to the gh actions panel
console.log(rawData)

mkdirp.sync(path.join(nextMetaRoot, 'analyze/'))
fs.writeFileSync(
  path.join(nextMetaRoot, 'analyze/__bundle_analysis.json'),
  rawData
)

// --------------
// Util Functions
// --------------

// given an array of scripts, return the total of their combined file sizes
function getScriptSizes(scriptPaths) {
  const res = scriptPaths.reduce(
    (acc, scriptPath) => {
      const [rawSize, gzipSize] = getScriptSize(scriptPath)
      acc.raw += rawSize
      acc.gzip += gzipSize
      return acc
    },
    { raw: 0, gzip: 0 }
  )
  return res
}

// given an individual path to a script, return its file size
function getScriptSize(scriptPath) {
  const encoding = 'utf8'
  const p = path.join(nextMetaRoot, scriptPath)

  let rawSize, gzipSize
  if (Object.keys(memoryCache).includes(p)) {
    rawSize = memoryCache[p][0]
    gzipSize = memoryCache[p][1]
  } else {
    const textContent = fs.readFileSync(p, encoding)
    rawSize = Buffer.byteLength(textContent, encoding)
    gzipSize = gzSize.sync(textContent)
    memoryCache[p] = [rawSize, gzipSize]
  }

  return [rawSize, gzipSize]
}