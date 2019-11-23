/**
 * DownloadProgressBar.js
 * Example of dealing with ReadableStream (https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream)
 * AND ReadableStreamDefaultReader (https://developer.mozilla.org/en-US/docs/Web/API/ReadableStreamDefaultReader)
 * from browser.
 *
 * Copyright © 2019 NickPepper. All rights reserved.
 */

import { MDCLinearProgress }  from '@material/linear-progress'
import {
  formatBytes,
  newElem, byId
}                             from '../../../common/utils'
import { BAI_URL }            from '../../../common/constants'
import throttle               from 'lodash.throttle'


export default class DownloadProgressBar {
  constructor(params) {
    this.parentContainer  = params.parentContainer
    this.uuid             = params.uuid
    this.token            = params.token
    this.abortController  = new window.AbortController()
    this.reader           = null
    this.fileNameDiv      = null
    this.progressbar      = null
    this.perc             = null
    this.received         = null
    this.total            = null
    this.btnStart         = null
    this.btnCancel        = null
    this.contentLength    = 0
    this.receivedLength   = 0  // received that many bytes
    this.chunks           = [] // array of received binary chunks (comprises the body)
    this.filename         = ''

    // methods
    this.createDOM                = this.createDOM.bind(this)
    this.updateProgress           = this.updateProgress.bind(this)
    this.updateProgressThrottled  = throttle(this.updateProgress, 100)
    this.initStream               = this.initStream.bind(this)
    this.handleStart              = this.handleStart.bind(this)
    this.handleCancel             = this.handleCancel.bind(this)
    this.setListeners             = this.setListeners.bind(this)
    this.unsetListeners           = this.unsetListeners.bind(this)
    this.init                     = this.init.bind(this)
    this.destroy                  = this.destroy.bind(this)

    this.init()
  }


  createDOM() {
    const container = newElem('DIV', {
      css: { display: 'flex', flexWrap: 'wrap', alignContent: 'center', justifyContent: 'flex-end' }
    })

    const fnameDiv = newElem('DIV', {
      attr: { id: 'progressbar_fname' },
      css: { width: '100%', marginBottom: '6px' }
    })
    container.appendChild(fnameDiv)

    let progressbar = newElem('DIV', {
      attr: { id: `progressbar_${this.uuid}`, class: 'mdc-linear-progress', role: 'progressbar' },
      html: `<div class="mdc-linear-progress__buffering-dots"></div>
            <div class="mdc-linear-progress__buffer"></div>
            <div class="mdc-linear-progress__bar mdc-linear-progress__primary-bar">
                <span class="mdc-linear-progress__bar-inner"></span>
            </div>
            <div class="mdc-linear-progress__bar mdc-linear-progress__secondary-bar">
                <span class="mdc-linear-progress__bar-inner"></span>
            </div>`
    })
    progressbar.setAttribute('aria-label', 'Progress Bar')
    progressbar.setAttribute('aria-valuemin', '0')
    progressbar.setAttribute('aria-valuemax', '1')
    progressbar.setAttribute('aria-valuenow', '0')
    container.appendChild(progressbar)

    const actionsDiv = newElem('DIV', {
      css: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginTop: '6px' }
    })
    const valueDiv = newElem('DIV', {
      css: { display: 'inline-block', marginTop: '-16px' },
      html: '<span id="download_perc">0%</span> (<span id="download_received">0</span> из <span id="download_total">0</span>)'
    })
    const btnDiv = newElem('DIV', {
      css: { display: 'inline-flex' },
      html: `<button id="start_download_button" class="mdc-icon-button mdc-fab mdc-fab--mini" aria-hidden="true" aria-pressed="false" aria-label="Start Download" title="Начать закачку" style="margin: 2px 0 0 22px;">
                <i class="material-icons mdc-icon-button__icon">play_arrow</i>
            </button>
            <button id="cancel_download_button" class="mdc-icon-button mdc-fab mdc-fab--mini fab-close" aria-hidden="true" aria-pressed="false" aria-label="Cancel Download" title="Прервать закачку" style="margin: 2px 0 0 22px;">
                <i class="material-icons mdc-icon-button__icon">close</i>
            </button>`
    })
    actionsDiv.appendChild(valueDiv)
    actionsDiv.appendChild(btnDiv)
    container.appendChild(actionsDiv)
    this.parentContainer.appendChild(container)

    this.fileNameDiv  = byId('progressbar_fname')
    this.progressbar  = new MDCLinearProgress(byId(`progressbar_${this.uuid}`))
    this.perc         = byId('download_perc')
    this.received     = byId('download_received')
    this.total        = byId('download_total')
    this.btnStart     = byId('start_download_button')
    this.btnCancel    = byId('cancel_download_button')
    this.btnCancel.style.display = 'none'
  }


  updateProgress() {
    const perc = parseFloat(((this.receivedLength / this.contentLength) * 100).toFixed(1))
    const formattedReceivedLength = formatBytes(this.receivedLength, 2)
    const peperc = parseFloat((perc / 100).toFixed(3))
    this.progressbar.progress = peperc
    this.perc.textContent = `${perc}%`
    this.received.textContent = formattedReceivedLength
  }


  initStream() {
    // YES!
    // An old good XMLHttpRequest becase of this FUCKING FACT:
    // https://medium.com/@drevets/you-cant-prompt-a-file-download-with-the-content-disposition-header-using-axios-xhr-sorry-56577aa706d6

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.withCredentials = true
      xhr.open('GET', `${BAI_URL}/api/dataset/download/${this.uuid}`)
      xhr.setRequestHeader('Authorization', `Basic ${this.token}`)
      xhr.setRequestHeader('cache-control', 'no-cache')
      xhr.addEventListener('error', (err) => reject(err))
      xhr.addEventListener('readystatechange', () => {
        if (this.readyState === this.HEADERS_RECEIVED) {
          // get file name and set the corresponding field (only if wasnt already set)
          if (!this.filename.length) {
            const disposition = xhr.getResponseHeader('Content-Disposition')
            if (disposition && disposition.indexOf('attachment') !== -1) {
              const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/
              let matches = filenameRegex.exec(disposition)
              if (matches && matches[1]) {
                this.filename = matches[1].replace(/['"]/g, '')
                this.fileNameDiv.textContent = this.filename
              }
            }
          }
          // get total length and set the corresponding field (only if wasnt already set)
          if (this.total.textContent === '0') {
            const contentLength = +xhr.getResponseHeader('Content-Length')
            this.contentLength = contentLength
            const formattedContentLength = formatBytes(contentLength)
            this.total.textContent = formattedContentLength
          }
          // abort XHR and return
          xhr.abort()
          resolve()
        }
      })
      xhr.send()
    })
  }


  handleStart() {
    this.btnStart.style.display  = 'none'
    this.btnCancel.style.display = 'flex'

    // start fetch
    fetch(`${BAI_URL}/api/dataset/download/${this.uuid}`, {
      method: 'GET',
      signal: this.abortController.signal,
      headers: new Headers({
        'Content-Type': 'application/json',
        'Authorization': `Basic ${this.token}`
      })
    }).then(async res => {
      // obtain a reader
      this.reader = res.body.getReader()

      // eslint-disable-next-line no-constant-condition
      while (true) {
        try {
          const { done, value } = await this.reader.read()
          if (done) {
            console.log('>>>>>>>>>>>>>>>>>>>> DOWNLOAD FINISHED !!!')
            // TODO: return { error: false, message: 'Fetch finished OK', data: new Blob(this.chunks) }
            break
          }
          this.chunks.push(value)
          this.receivedLength += value.length
          this.updateProgressThrottled()
        } catch (err) {
          console.error('ERROR inside while: ', err)
          // TODO: return { error: false, message: 'Fetch cancelled...', data: null }
        }
      }
    }).catch(err => {
      if (err.name === 'AbortError') {
        return // expected, an abort, so just return
      }
      // else
      console.error('error in handleStart() -> fetch: ', err)
      // TODO: return { error: false, message: 'Fetch cancelled...', data: null }
    })
  }


  handleCancel() {
    if (this.reader) {
      this.reader.cancel()
      this.reader.releaseLock()
      this.reader = null
    }
    this.receivedLength = 0
    this.chunks         = []
    this.progressbar.progress = 0
    this.perc.textContent = '0%'
    const formattedReceivedLength = formatBytes(this.receivedLength)
    this.received.textContent = formattedReceivedLength
    this.btnCancel.style.display = 'none'
    this.btnStart.style.display  = 'flex'
  }


  setListeners() {
    this.btnStart.addEventListener('click', this.handleStart)
    this.btnCancel.addEventListener('click', this.handleCancel)
  }


  unsetListeners() {
    this.btnCancel.removeEventListener('click', this.handleCancel)
    this.btnStart.removeEventListener('click', this.handleStart)
  }


  init() {
    // console.log('')
    // console.log('DownloadProgressBar :: init()')
    // console.log('this.uuid: ', this.uuid)

    this.createDOM()
    this.initStream().then(() => {
      this.setListeners()
    }).catch((err) => {
      console.error('ERROR while initStream(), err: ', err)
      // TODO: return { error: false, message: 'Fetch cancelled...', data: null }
    })

    if (this.parentContainer.style.display === 'none') {
      this.parentContainer.style.display = 'block'
    }
  }


  destroy() {
    this.unsetListeners()

    if (this.reader) {
      this.reader.cancel()
      this.reader.releaseLock()
      this.reader = null
    }
    this.abortController.abort()

    this.fileNameDiv    = null
    this.progressbar    = null
    this.perc           = null
    this.received       = null
    this.total          = null
    this.btnStart       = null
    this.btnCancel      = null
    this.contentLength  = 0
    this.receivedLength = 0
    this.chunks         = []
    this.filename       = ''
  }
}
