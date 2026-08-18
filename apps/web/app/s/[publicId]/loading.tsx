import { Skeleton } from '@/components/ui/skeleton'

/** Carga del documento: skeletons con la forma real (PRD §8). */
export default function LoadingSessionDocument() {
  return (
    <div className="flex min-h-full flex-col" aria-busy>
      <div className="sticky top-0 z-40 h-14 shrink-0 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-full max-w-5xl items-center gap-3 px-6">
          <Skeleton className="size-4 rounded-full" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="hidden h-4 w-52 md:block" />
          <div className="flex-1" />
          <Skeleton className="h-8 w-28" />
        </div>
      </div>

      <div className="mx-auto w-full max-w-5xl flex-1 px-6 pb-24">
        <Skeleton className="mt-8 h-9 w-80 max-w-full" />
        <Skeleton className="mt-3 h-4 w-96 max-w-full" />
        <Skeleton className="mt-6 h-8 w-64 max-w-full" />

        <div className="mt-6 flex gap-3 overflow-hidden border-b pb-3">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-16 w-40 shrink-0" />
          ))}
        </div>

        <div className="mt-8">
          <div className="flex items-baseline gap-3 border-b pb-2">
            <Skeleton className="h-4 w-6" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-20" />
            <div className="flex-1" />
            <Skeleton className="h-5 w-24" />
          </div>
          <div className="mt-4 grid gap-6 md:grid-cols-5 xl:grid-cols-3">
            <Skeleton className="aspect-[1440/900] w-full md:col-span-3 xl:col-span-2" />
            <div className="flex flex-col gap-3 md:col-span-2 xl:col-span-1">
              {[0, 1, 2].map((index) => (
                <Skeleton key={index} className="h-28 w-full" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
