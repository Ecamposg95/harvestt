import { splitScientificName } from './labels'

export function ScientificName({ name, authorship }: { name: string; authorship: string | null }) {
  const [binomial, author] = splitScientificName(name, authorship)
  return (
    <span>
      <em className="italic">{binomial}</em>
      {author && <span className="ml-1 font-normal text-muted not-italic">{author}</span>}
    </span>
  )
}
