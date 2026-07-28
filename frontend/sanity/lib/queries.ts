import {defineQuery} from 'next-sanity'

const navLinkProjection = /* groq */ `
  _key,
  _type,
  title,
  link {
    ...,
    _type == "link" => {
      "page": page->slug.current,
      "post": post->slug.current
    }
  },
  "resolvedTitle": coalesce(title, link.page->name, link.post->title, link.href)
`

export const settingsQuery = defineQuery(`*[_type == "settings"][0]{
	...,
	homepage->,
	contact,
	legal,
	builtWith[]{
		name,
		url,
		icon
	},
	mobileNav,
	navigation[]{
		_type == "navLink" => {
			${navLinkProjection}
		},
		_type == "navDropdown" => {
			_key,
			_type,
			title,
			links[]{
				${navLinkProjection}
			}
		}
	}
}`)

const postFields = /* groq */ `
  _id,
  "status": select(_originalId in path("drafts.**") => "draft", "published"),
  "title": coalesce(title, "Untitled"),
  "slug": slug.current,
  excerpt,
  coverImage,
  "date": coalesce(date, _updatedAt),
  "author": author->{firstName, lastName, picture},
`

const projectFields = /* groq */ `
  _id,
  "status": select(_originalId in path("drafts.**") => "draft", "published"),
  "title": coalesce(title, "Untitled"),
  "slug": slug.current,
  excerpt,
  coverImage,
  website,
  repo,
  featured,
  hidden,
  "publishedAt": coalesce(publishedAt, _createdAt),
  "updatedAt": coalesce(updatedAt, _updatedAt),
  orderRank,
  "categories": categories[]->{_id, title, "slug": slug.current},
  "tech": tech[]->{_id, title, "slug": slug.current},
`

const linkReference = /* groq */ `
  _type == "link" => {
    "page": page->slug.current,
    "post": post->slug.current
  }
`

const linkFields = /* groq */ `
  link {
      ...,
      ${linkReference}
      }
`

// Shared projection for the reusable `background` object (page-level + per-block).
const backgroundFields = /* groq */ `
  background {
    type,
    preset,
    speed,
    intensity,
    colorSource,
    customColor,
    opacity
  }
`

export const getPageQuery = defineQuery(`
  *[_type == 'page' && slug.current == $slug][0]{
    _id,
    _type,
    name,
    slug,
    heading,
    subheading,
    titleDisplay,
    archive,
    ${backgroundFields},
    "pageBuilder": pageBuilder[]{
      ...,
      ${backgroundFields},
      _type == "callToAction" => {
        ...,
        button {
          ...,
          ${linkFields}
        }
      },
      _type == "infoSection" => {
        content[]{
          ...,
          markDefs[]{
            ...,
            ${linkReference}
          }
        }
      },
      _type == "hero" => {
        ...,
        buttons[]{
          ...,
          ${linkFields}
        }
      },
      _type == "featuresGrid" => {
        ...,
        features[]{
          ...,
          ${linkFields}
        }
      },
      _type == "gallery" => {
        ...,
        items[]{
          ...,
          _type == "galleryImage" => {
            "aspectRatio": asset->metadata.dimensions.aspectRatio
          },
          _type == "galleryVideo" => {
            "poster": poster{
              ...,
              "aspectRatio": asset->metadata.dimensions.aspectRatio
            }
          }
        }
      },
      _type == "faq" => {
        ...,
        items[]{
          ...,
          answer[]{
            ...,
            markDefs[]{
              ...,
              ${linkReference}
            }
          }
        }
      },
      _type == "note" => {
        ...,
        tone,
        icon,
        content[]{
          ...,
          markDefs[]{
            ...,
            ${linkReference}
          }
        }
      },
      _type == "scores" => {
        ...,
        heading,
        caption[]{
          ...,
          markDefs[]{
            ...,
            ${linkReference}
          }
        },
        items[]{
          _key,
          label,
          value,
          max,
          asPercent
        }
      },
      _type == "postsArchive" => {
        ...,
        category->{_id, title, "slug": slug.current},
        "posts": select(
          source == "picked" => posts[]->{ ${postFields} },
          source == "all" => *[_type == "post" && defined(slug.current) && (!defined(^.category) || ^.category._ref in categories[]._ref)] | order(date desc, _updatedAt desc){
            ${postFields}
          },
          *[_type == "post" && defined(slug.current) && (!defined(^.category) || ^.category._ref in categories[]._ref)] | order(date desc, _updatedAt desc)[0...24]{
            ${postFields}
          }
        )
      },
      _type == "projectsArchive" => {
        ...,
        category->{_id, title, "slug": slug.current},
        "projects": select(
          source == "picked" => projects[]->{ ${projectFields} },
          source == "all" => *[_type == "project" && defined(slug.current) && !hidden && (!defined(^.category) || ^.category._ref in categories[]._ref)] | order(coalesce(publishedAt, _createdAt) desc){
            ${projectFields}
          },
          *[_type == "project" && defined(slug.current) && !hidden && (!defined(^.category) || ^.category._ref in categories[]._ref)] | order(coalesce(publishedAt, _createdAt) desc)[0...24]{
            ${projectFields}
          }
        )
      },
      _type == "authorsArchive" => {
        ...,
        "authors": select(
          source == "picked" => authors[]->{
            _id, firstName, lastName, picture,
            "postCount": count(*[_type == "post" && defined(slug.current) && references(^._id)])
          },
          *[_type == "person"] | order(lastName asc, firstName asc)[0...48]{
            _id, firstName, lastName, picture,
            "postCount": count(*[_type == "post" && defined(slug.current) && references(^._id)])
          }
        )
      },
    },
  }
`)

export const sitemapData = defineQuery(`
  *[(_type == "page" || _type == "post" || _type == "project") && defined(slug.current) && !(_type == "project" && hidden == true)] | order(_type asc) {
    "slug": slug.current,
    _type,
    _updatedAt,
  }
`)

export const allPostsQuery = defineQuery(`
  *[_type == "post" && defined(slug.current)] | order(date desc, _updatedAt desc) {
    ${postFields}
  }
`)

export const morePostsQuery = defineQuery(`
  *[_type == "post" && _id != $skip && defined(slug.current)] | order(date desc, _updatedAt desc) [0...$limit] {
    ${postFields}
  }
`)

export const postQuery = defineQuery(`
  *[_type == "post" && slug.current == $slug] [0] {
    content[]{
    ...,
    markDefs[]{
      ...,
      ${linkReference}
    }
  },
    ${postFields}
  }
`)

export const postPagesSlugs = defineQuery(`
  *[_type == "post" && defined(slug.current)]
  {"slug": slug.current}
`)

export const pagesSlugs = defineQuery(`
  *[_type == "page" && defined(slug.current)]
  {"slug": slug.current}
`)

// Resolve the canonical archive page's slug for a given archive type (the stored
// `archive` value is the block `_type`, e.g. "projectsArchive"). Used to build
// links to the listing (project detail back-link + taxonomy chips). Each archive
// is unique to one page (enforced in the Studio schema), so `[0]` is exact.
export const archivePageSlugQuery = defineQuery(`
  *[_type == "page" && archive == $archive && defined(slug.current)][0].slug.current
`)

export const allProjectsQuery = defineQuery(`
  *[_type == "project" && defined(slug.current) && !hidden] | order(featured desc, coalesce(publishedAt, _createdAt) desc) {
    ${projectFields}
  }
`)

export const projectBySlugQuery = defineQuery(`
  *[_type == "project" && slug.current == $slug] [0] {
    ${projectFields}
    body[]{
      ...,
      markDefs[]{
        ...,
        ${linkReference}
      }
    },
    ogImage,
  }
`)

export const projectSlugsQuery = defineQuery(`
  *[_type == "project" && defined(slug.current) && !hidden]
  {"slug": slug.current}
`)

/**
 * Prev/next fallback for the project detail page (issue #17), used when no
 * in-tab nav context exists (direct link / new tab). The fallback must render
 * the same order the canonical projects archive renders with, so the archive
 * block's `sortField`/`sortDirection` (issue #16) ride along and the list is
 * sorted app-side with the shared `applyArchiveSort` comparators in
 * `projects/[slug]/page.tsx` — GROQ `order()` can't take a field resolved in
 * the same query. `sort` is `null` when no page is designated the projects
 * archive; `source` lets the caller skip re-sorting for hand-picked archives
 * (their sort fields are hidden and possibly stale). When the visitor
 * navigates from a list, the sessionStorage snapshot of that list (its
 * rendered filter/sort state) wins instead (see
 * `app/components/projects/nav-context.ts`).
 */
export const projectNavQuery = defineQuery(`{
  "sort": *[_type == "page" && archive == "projectsArchive"][0]
    .pageBuilder[_type == "projectsArchive"][0]{sortField, sortDirection, source},
  "projects": *[_type == "project" && defined(slug.current) && !hidden] | order(coalesce(publishedAt, _createdAt) desc) {
    "slug": slug.current,
    title,
    "publishedAt": coalesce(publishedAt, _createdAt),
    "updatedAt": coalesce(updatedAt, _updatedAt),
    orderRank
  }
}`)
