export type CartKeyAttribute = {
  name: string;
  option: string;
};

function normalizeAttributeName(
  value: string,
): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^attribute_/, "")
    .replace(/^pa_/, "")
    .replace(/[\s_-]+/g, "");
}

function normalizeAttributeOption(
  value: string,
): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeAttributes(
  attributes: CartKeyAttribute[],
): CartKeyAttribute[] {
  const uniqueAttributes =
    new Map<
      string,
      CartKeyAttribute
    >();

  for (
    const attribute of
    attributes
  ) {
    const name =
      attribute.name
        .replace(/\s+/g, " ")
        .trim();

    const option =
      attribute.option
        .replace(/\s+/g, " ")
        .trim();

    if (!name || !option) {
      continue;
    }

    const normalizedName =
      normalizeAttributeName(
        name,
      );

    const normalizedOption =
      normalizeAttributeOption(
        option,
      );

    if (
      !normalizedName ||
      !normalizedOption
    ) {
      continue;
    }

    uniqueAttributes.set(
      normalizedName,
      {
        name:
          name.slice(0, 150),

        option:
          option.slice(0, 250),
      },
    );
  }

  return Array.from(
    uniqueAttributes.values(),
  );
}

export function buildCartKey({
  productId,
  variationId,
  attributes = [],
}: {
  productId: number;
  variationId?: number;
  attributes?: CartKeyAttribute[];
}): string {
  if (
    !Number.isInteger(productId) ||
    productId < 1
  ) {
    throw new Error(
      "A valid product ID is required to build a cart key.",
    );
  }

  if (
    variationId !== undefined &&
    (
      !Number.isInteger(
        variationId,
      ) ||
      variationId < 1
    )
  ) {
    throw new Error(
      "Variation ID must be a positive integer.",
    );
  }

  const normalizedAttributes =
    normalizeAttributes(
      attributes,
    );

  const attributeKey =
    normalizedAttributes
      .map((attribute) => ({
        name:
          normalizeAttributeName(
            attribute.name,
          ),

        option:
          normalizeAttributeOption(
            attribute.option,
          ),
      }))
      .filter(
        (attribute) =>
          attribute.name &&
          attribute.option,
      )
      .sort((first, second) => {
        const nameComparison =
          first.name.localeCompare(
            second.name,
          );

        if (
          nameComparison !== 0
        ) {
          return nameComparison;
        }

        return first.option.localeCompare(
          second.option,
        );
      })
      .map(
        (attribute) =>
          `${attribute.name}:${attribute.option}`,
      )
      .join("|");

  return [
    `product-${productId}`,
    `variation-${variationId ?? 0}`,

    attributeKey
      ? `attributes-${encodeURIComponent(
          attributeKey,
        )}`
      : "attributes-none",
  ].join("::");
}