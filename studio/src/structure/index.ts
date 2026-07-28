import {CogIcon} from '@sanity/icons/Cog'
import {RocketIcon} from '@sanity/icons/Rocket'
import {TagIcon} from '@sanity/icons/Tag'
import {orderableDocumentListDeskItem} from '@sanity/orderable-document-list'
import type {StructureBuilder, StructureResolver, StructureResolverContext} from 'sanity/structure'
import {DocumentActionComponent, DocumentActionsContext, Template} from 'sanity'
import pluralize from 'pluralize-esm'

/**
 * Structure builder is useful whenever you want to control how documents are grouped and
 * listed in the studio or for adding additional in-studio previews or content to documents.
 * Learn more: https://www.sanity.io/docs/structure-builder-introduction
 */

const DISABLED_TYPES = ['settings', 'assist.instruction.context']

// Define the actions that should be available for singleton documents
const singletonActions = new Set(['publish', 'discardChanges', 'restore'])

// Define the singleton document types
const singletonTypes = new Set(['settings'])

export const structure = (S: StructureBuilder, context: StructureResolverContext) =>
  S.list()
    .title('Content')
    .items([
      /** ABOUT */
      S.listItem()
        .title('Site Settings')
        .icon(CogIcon)
        .child(S.document().title('Site Settings').schemaType('settings').documentId('settings')),
      // S.documentTypeListItem('taxonomy').title('Taxonomies').icon(_TagIcon),
      S.divider(),

      ...S.documentTypeListItems()
        // Remove the "assist.instruction.context" and "settings" content  from the list of content types
        .filter((listItem: any) => !DISABLED_TYPES.includes(listItem.getId()))
        // Pluralize the title of each document type.  This is not required but just an option to consider.
        .map((listItem) => {
          return listItem.title(pluralize(listItem.getTitle() as string))
        })
        // Projects swap in a drag-and-drop ordered list (orderRank) — the
        // projects archive's 'custom' sort renders in this order.
        .map((listItem) =>
          listItem.getId() === 'project'
            ? orderableDocumentListDeskItem({
                type: 'project',
                title: 'Projects',
                icon: RocketIcon,
                S,
                context,
              })
            : listItem,
        ),
    ])

export const schemaOptions = {
  // types: types,
  // Filter out singleton types from the global “New document” menu options
  templates: (templates: Template<any, any>[]) =>
    templates.filter(({schemaType}: {schemaType: string}) => !singletonTypes.has(schemaType)),
}
export const documentOptions = {
  // For singleton types, filter out actions that are not explicitly included
  // in the `singletonActions` list defined above
  actions: (input: DocumentActionComponent[], context: DocumentActionsContext) =>
    singletonTypes.has(context.schemaType)
      ? input.filter(({action}) => action && singletonActions.has(action))
      : input,
}
