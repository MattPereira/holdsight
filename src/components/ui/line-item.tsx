"use client";

import * as React from "react";
import { RiArrowRightSLine } from "@remixicon/react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";

// Shared row anatomy used by both the allocations and accounts lists:
//   [chevron gutter] [leading slot] [label / sublabel] ........ [value / secondary]
// The chevron gutter is a fixed 16px column (size-4) so swatches/icons and
// labels stay aligned whether or not a row is collapsible.

type LineItemFields = {
  /** Leading visual: a color swatch, icon, etc. Optional. */
  leading?: React.ReactNode;
  label: React.ReactNode;
  labelClassName?: string;
  labelTitle?: string;
  sublabel?: React.ReactNode;
  sublabelTitle?: string;
  /** Primary right-aligned value (e.g. percent or USD total). */
  value: React.ReactNode;
  valueClassName?: string;
  /** Secondary right-aligned value rendered small + muted below `value`. */
  secondaryValue?: React.ReactNode;
};

function LineItemContent({
  gutter,
  leading,
  label,
  labelClassName,
  labelTitle,
  sublabel,
  sublabelTitle,
  value,
  valueClassName,
  secondaryValue,
}: LineItemFields & { gutter: React.ReactNode }) {
  return (
    <>
      <span className="flex min-w-0 items-center gap-3">
        {gutter}
        {leading}
        <span className="flex min-w-0 flex-col">
          <span
            className={cn(
              "min-w-0 truncate text-base font-semibold",
              labelClassName,
            )}
            title={labelTitle}
          >
            {label}
          </span>
          {sublabel ? (
            <span
              className="min-w-0 truncate text-xs text-muted-foreground"
              title={sublabelTitle}
            >
              {sublabel}
            </span>
          ) : null}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end">
        <span
          className={cn("text-base font-semibold tabular-nums", valueClassName)}
        >
          {value}
        </span>
        {secondaryValue ? (
          <span className="text-xs tabular-nums text-muted-foreground">
            {secondaryValue}
          </span>
        ) : null}
      </span>
    </>
  );
}

/** Bordered, rounded container. Wraps Radix Accordion so a list can mix
 *  collapsible and static rows; `type` defaults to "multiple". */
export function LineItemGroup({
  className,
  ...props
}: React.ComponentProps<typeof Accordion>) {
  return (
    <Accordion
      className={cn("overflow-hidden rounded-lg border", className)}
      {...props}
    />
  );
}

/** A non-collapsible row. The chevron column is reserved with a spacer so it
 *  aligns with sibling collapsible rows. */
export function LineItemRow({
  className,
  ...fields
}: LineItemFields & { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 px-4 py-3 not-last:border-b",
        className,
      )}
    >
      <LineItemContent
        gutter={<span aria-hidden="true" className="size-4 shrink-0" />}
        {...fields}
      />
    </div>
  );
}

/** A collapsible row. Renders the chevron in the gutter and reveals `children`
 *  (typically a <NestedLineItems>) when expanded. */
export function CollapsibleLineItem({
  id,
  className,
  triggerClassName,
  contentClassName,
  children,
  ...fields
}: LineItemFields & {
  id: string;
  className?: string;
  triggerClassName?: string;
  contentClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <AccordionItem value={id} className={className}>
      <AccordionTrigger
        hideIcon
        className={cn(
          "min-w-0 items-center gap-4 rounded-none px-4 py-3 font-normal hover:no-underline",
          triggerClassName,
        )}
      >
        <LineItemContent
          gutter={
            <RiArrowRightSLine className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-aria-expanded/accordion-trigger:rotate-90" />
          }
          {...fields}
        />
      </AccordionTrigger>
      <AccordionContent className={cn("p-0", contentClassName)}>
        {children}
      </AccordionContent>
    </AccordionItem>
  );
}

/** Indented container for a collapsible row's children, rendered as a muted,
 *  rounded panel that visually groups the nested rows. */
export function NestedLineItems({
  className,
  ...props
}: React.ComponentProps<"ul">) {
  return (
    <ul
      className={cn(
        "mx-4 mb-4 flex flex-col gap-3 rounded-lg bg-muted/50 px-4 py-3",
        className,
      )}
      {...props}
    />
  );
}

/** A child row inside <NestedLineItems>: smaller, no chevron gutter. */
export function NestedLineItem({
  label,
  labelTitle,
  sublabel,
  sublabelTitle,
  value,
  valueClassName,
  secondaryValue,
}: Omit<LineItemFields, "leading" | "labelClassName">) {
  return (
    <li className="flex items-center justify-between gap-4 text-sm py-1">
      <span className="flex min-w-0 flex-col">
        <span className="min-w-0 truncate font-normal" title={labelTitle}>
          {label}
        </span>
        {sublabel ? (
          <span
            className="min-w-0 truncate text-xs text-muted-foreground"
            title={sublabelTitle}
          >
            {sublabel}
          </span>
        ) : null}
      </span>
      <span className="flex shrink-0 flex-col items-end">
        <span className={cn("font-normal tabular-nums", valueClassName)}>
          {value}
        </span>
        {secondaryValue ? (
          <span className="text-xs tabular-nums text-muted-foreground">
            {secondaryValue}
          </span>
        ) : null}
      </span>
    </li>
  );
}
