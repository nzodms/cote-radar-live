/** Shopify Admin GraphQL queries used by the sync + test endpoints. */

export const SHOP_QUERY = /* GraphQL */ `
  query Shop {
    shop {
      name
      myshopifyDomain
    }
  }
`;

export const RECENT_ORDERS_QUERY = /* GraphQL */ `
  query RecentOrders($first: Int!) {
    orders(first: $first, sortKey: CREATED_AT, reverse: true) {
      edges {
        node {
          id
          name
          createdAt
          displayFinancialStatus
          displayFulfillmentStatus
          currencyCode
          totalPriceSet {
            shopMoney { amount currencyCode }
          }
          note
          tags
          customer { displayName }
          shippingAddress { country countryCodeV2 province city }
          lineItems(first: 10) {
            edges {
              node {
                id
                title
                quantity
                originalUnitPriceSet { shopMoney { amount currencyCode } }
                image { url }
                variant {
                  id
                  title
                  sku
                  selectedOptions { name value }
                  image { url }
                  product { id title featuredImage { url } }
                }
              }
            }
          }
        }
      }
    }
  }
`;

export const PRODUCTS_QUERY = /* GraphQL */ `
  query Products($first: Int!) {
    products(first: $first, sortKey: UPDATED_AT, reverse: true) {
      edges {
        node {
          id
          title
          status
          totalInventory
          featuredImage { url }
          variants(first: 5) {
            edges { node { id title sku price } }
          }
        }
      }
    }
  }
`;
