const glados = async () => {
  const notice = []
  let failed = false
  if (!process.env.GLADOS) {
    return { notice: ['Checkin Error', 'GLADOS Secret 未配置'], failed: true }
  }

  const agents = String(process.env.GLADOS_UA || '').split(/\r?\n/).filter(Boolean)
  if (!agents.length) {
    return { notice: ['Checkin Error', 'GLADOS_UA Secret 未配置'], failed: true }
  }

  const cookies = String(process.env.GLADOS).split(/\r?\n/).filter(Boolean)
  if (!cookies.length) {
    return { notice: ['Checkin Error', 'GLADOS Secret 为空'], failed: true }
  }
  for (const [index, cookie] of cookies.entries()) {


    try {
      const domain = process.env.DOMAIN || 'glados.cloud'

      const common = {
        'cookie': cookie,
        'referer': `https://${domain}/console/checkin`,
        'origin': `https://${domain}`,
        'accept': 'application/json, text/plain, */*',
        'user-agent': agents[index] || agents[0],
      }

      const action = await fetch(`https://${domain}/api/user/checkin`, {
        method: 'POST',
        headers: {
          ...common,
          'content-type': 'application/json;charset=UTF-8',
        },
        body: JSON.stringify({ token: domain }),
      }).then((r) => r.json())

      if (action?.code && !(action.code === 1 && action.message?.startsWith("Today's observation logged."))) throw new Error(`${action?.message} (code=${action.code})`)

      const status = await fetch(`https://${domain}/api/user/status`, {
        method: 'GET',
        headers: {
          ...common,
          // GET 请求不要带 content-type
        },
      }).then((r) => r.json())

      if (status?.code) throw new Error(status?.message)

      notice.push(
        'Checkin OK',
        `${action?.message}`,
        `Left Days ${Number(status?.data?.leftDays)}`
      )
    } catch (error) {
      failed = true
      console.error(`Account ${index + 1}: check-in failed; see notification for details`)
      notice.push(
        'Checkin Error',
        `${error}`,
        `<${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}>`
      )
    }
  }

  return { notice, failed }
}

const notify = async (notice) => {
  if (!process.env.NOTIFY || !notice) return

  for (const option of String(process.env.NOTIFY).split('\n')) {
    if (!option) continue

    try {
      if (option.startsWith('console:')) {
        for (const line of notice) {
          console.log(line)
        }
      } else if (option.startsWith('wxpusher:')) {
        await fetch(`https://wxpusher.zjiecode.com/api/send/message`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            appToken: option.split(':')[1],
            summary: notice[0],
            content: notice.join('<br>'),
            contentType: 3,
            uids: option.split(':').slice(2),
          }),
        })
      } else if (option.startsWith('pushplus:')) {
        await fetch(`https://www.pushplus.plus/send`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            token: option.split(':')[1],
            title: notice[0],
            content: notice.join('<br>'),
            template: 'markdown',
          }),
        })
      } else if (option.startsWith('bark:')) {
        await fetch(`https://api.day.app/${option.split(':')[1]}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            title: notice[0],
            body: notice.slice(1).join('\n'),
          }),
        })
      } else if (option.startsWith('qyweixin:')) {
        const qyweixinToken = option.split(':')[1]
        const qyweixinNotifyRebotUrl =
          'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=' + qyweixinToken

        await fetch(qyweixinNotifyRebotUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            msgtype: 'markdown',
            markdown: {
              content: notice.join('<br>'),
            },
          }),
        })
      } else {
        await fetch(`https://www.pushplus.plus/send`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            token: option,
            title: notice[0],
            content: notice.join('<br>'),
            template: 'markdown',
          }),
        })
      }
    } catch (error) {
      throw error
    }
  }
}

const main = async () => {
  const { notice, failed } = await glados()
  if (failed) notice[0] = 'Checkin Error'
  if (failed && !process.env.NOTIFY) console.error('Check-in failed; configure NOTIFY for details')
  await notify(notice)
  if (failed) process.exitCode = 1
}

main()
