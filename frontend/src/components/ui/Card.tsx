import { HTMLAttributes } from 'react'
import { cx } from './cx'

/** Tarjeta de vidrio (Salvia cristal). */
export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('glass', className)} {...rest} />
}
