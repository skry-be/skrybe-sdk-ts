import { parseJsonObject } from '../parse.js'
import type { Transport } from '../transport.js'

/** The editor the Skrybe dashboard opens a template in. */
export type TemplateEditor = 'html' | 'dragdrop'

export interface Template {
  id: number
  name: string
  from_name: string
  from_email: string
  reply_to: string
  editor: TemplateEditor
  /** Only from `get()` with `includeContent`, and from create and update. */
  html_text?: string
  plain_text?: string
}

export interface TemplateFields {
  name?: string
  htmlText?: string
  plainText?: string
  fromName?: string
  fromEmail?: string
  replyTo?: string
  editor?: TemplateEditor
}

const fieldsBody = (fields: TemplateFields) => ({
  name: fields.name,
  html_text: fields.htmlText,
  plain_text: fields.plainText,
  from_name: fields.fromName,
  from_email: fields.fromEmail,
  reply_to: fields.replyTo,
  editor: fields.editor,
})

export class Templates {
  constructor(private readonly transport: Transport) {}

  /** The brand's templates by name, without their HTML. */
  async list(): Promise<Template[]> {
    const text = await this.transport.text({ path: 'api/templates/get-templates.php', retryable: true })
    return parseJsonObject<{ templates: Template[] }>(text, 'templates').templates
  }

  async get(templateId: number, opts: { includeContent?: boolean } = {}): Promise<Template> {
    const text = await this.transport.text({
      path: 'api/templates/get-template.php',
      body: { template_id: templateId, include_content: opts.includeContent ? 'yes' : undefined },
      retryable: true,
    })
    return parseJsonObject<Template>(text, 'template')
  }

  /** Not retried: a repeat would create a second template. */
  async create(fields: TemplateFields & { name: string; htmlText: string }): Promise<Template> {
    const text = await this.transport.text({ path: 'api/templates/create-template.php', body: fieldsBody(fields) })
    return parseJsonObject<Template>(text, 'template')
  }

  /** Only the fields given change. */
  async update(templateId: number, fields: TemplateFields): Promise<Template> {
    const text = await this.transport.text({
      path: 'api/templates/update-template.php',
      body: { template_id: templateId, ...fieldsBody(fields) },
    })
    return parseJsonObject<Template>(text, 'template')
  }

  /** Campaigns already made from it are unaffected. */
  async delete(templateId: number): Promise<{ template_id: number; deleted: true }> {
    const text = await this.transport.text({
      path: 'api/templates/delete-template.php',
      body: { template_id: templateId },
    })
    return parseJsonObject<{ template_id: number; deleted: true }>(text, 'delete result')
  }
}
