import {
  Brackets,
  ObjectLiteral,
  OrderByCondition,
  SelectQueryBuilder,
} from "typeorm";
import { LoaderNamingStrategyEnum } from "./enums/LoaderNamingStrategy";
import { LoaderSearchMethod } from "./enums/LoaderSearchMethod";

export type WhereArgument = string | Brackets;

/**
 * @hidden
 */
export type WhereExpression = LoaderWhereExpression | Brackets;

/**
 * @hidden
 */
export interface LoaderWhereExpression {
  condition: string;
  params?: ObjectLiteral;
}

export interface LoaderOptions {
  /**
   * Include if you are using one of the supported TypeORM custom naming strategies
   */
  namingStrategy?: LoaderNamingStrategyEnum;
  /**
   * This column will always be loaded for every relation by the query builder.
   *
   * @deprecated The loader now automatically finds and selects the primary column from the entity metadata
   *             so this is no longer necessary. To avoid breaking the API, the query builder will still
   *             select this column for every relation, but the option will be removed in a future major version.
   */
  primaryKeyColumn?: string;
  /**
   * Use this search method by default unless overwritten in a query option. Defaults to any position
   */
  defaultSearchMethod?: LoaderSearchMethod;
  /**
   * Allows you to set a maximum query depth. This can be useful
   * in preventing malicious queries from locking up your database.
   * Defaults to Infinity
   */
  maxQueryDepth?: number;
  disableCache?: boolean;
}

export interface SearchOptions {
  /**
   * The database columns to be searched
   * If columns need to be joined in an or, pass them in as a nested array.
   * e.g. ["email", ["firstName", "lastName"]]
   * This will produce a query like the following:
   * `WHERE email LIKE :searchText
   *  OR firstName || ' ' || lastName LIKE :searchText
   */
  searchColumns: Array<string | Array<string>>;
  /**
   * The text to be searched for
   */
  searchText: string;
  /**
   * Optionally specify a search method. If not provided, default will be used (see LoaderOptions)
   */
  searchMethod?: LoaderSearchMethod;
  /**
   * Whether the query is case sensitive. Default to false. Uses SQL LOWER to perform comparison
   */
  caseSensitive?: boolean;
}

export interface QueryPagination {
  /**
   * the max number of records to return
   */
  limit: number;
  /**
   * the offset from where to return records
   */
  offset: number;
}

/**
 * This function will be called for each field at query resolution. The function will receive
 * whatever value was passed in the {@link GraphQLQueryBuilder.context|context} method, a string list
 * of queried fields from that entity, as well as the full selection object (GraphQL arguments and children) of
 * the current entity
 *
 * @example
 * ```typescript
 *
 * const requireUserPredicate = (context, queriedFields, selection) => {
 *   return context.requireUser || queriedFields.includes('userId') || selection.userId
 * }
 *
 * @Entity()
 * class Author extends BaseEntity {
 *
 *   // This relation will not be fetched if context value is false
 *   @ConfigureLoader({ignore: (context) => context.ignoreBooks})
 *   @OneToMany()
 *   books: [Book]
 *
 *   // This relation will be joined if the predicate returns true
 *   @ConfigureLoader({required: requireUserPredicate})
 *   @OneToOne()
 *   user: User
 *
 *   userId () {
 *    return this.user.id
 *   }
 * }
 *
 * ```
 */
export type FieldConfigurationPredicate = (
  context: any,
  queriedFields: Array<string>,
  selection: GraphQLEntityFields
) => boolean;

export interface LoaderFieldConfiguration {
  /**
   * When a field or relation is ignored, the loader will
   * never fetch it from the database, even if a matching field
   * name is present in the GraphQL Query.
   *
   * This is useful if you have a field that exists in both your
   * GraphQL schema and on your entity, but you want the field
   * to have custom resolve logic in order to implement
   * things like pagination or sorting. Ignoring the field will
   * improve dataloader performance as it helps prevent
   * over-fetching from the database.
   *
   * Please note that if a field is ignored, the entire sub-graph
   * will be ignored as well.
   */
  ignore?: boolean | FieldConfigurationPredicate;

  /**
   * When a field or relation is required, the loader will always
   * fetch it from the database, regardless of whether or not it
   * was included in the GraphQL Query.
   *
   * This is useful if your entity relies on particular fields for
   * computed values or relations. Because the loader typically
   * only fetches the fields from the database that were requested
   * in the GraphQL query, using this option is a good way to ensure
   * any computed properties work the way you expect them to.
   *
   * Important note:
   * When requiring a relation, the loader will perform a
   * `leftJoinAndSelect` on the relation. This loads all the
   * relation's fields (essentially doing a `SELECT *` on the
   * relation). It does not currently perform any recursive requires
   * for the joined relation.
   */
  required?: boolean | FieldConfigurationPredicate;

  /**
   * The name of this field in the GraphQL schema. If the given graphQLName
   * is found in a query, the loader will select this field. Please note that the
   * loader DOES NOT change the name on the returned TypeORM entity. You will need to provide
   * a field resolver to perform that mapping in your schema. This is behavior is to ensure
   * that the loader always returns a valid TypeORM entity.
   *
   * @example
   * ```typescript
   * // Entity Class
   * @Entity()
   * class User extends BaseEntity {
   *
   *   @ConfigureLoader({ graphQLName: 'username' })
   *   @Column()
   *   email: string
   * }
   *
   * // Resolvers
   *
   * const resolvers = {
   *   Query: {
   *     userQuery (root, args, context, info) {
   *       return context.loader
   *         .loadEntity(User, 'user')
   *         .info(info)
   *         .where('user.id = :id', { id: args.id })
   *         .loadOne()
   *     }
   *   },
   *   User: {
   *     username (root: User) {
   *       // If username is queried, the loader will
   *       // include a select for the email column
   *       // which can be resolved here.
   *       return root.email
   *     }
   *   }
   * }
   * ```
   */
  graphQLName?: string;

  /**
   * Manually specify the alias of a table during the SQL join.
   * This is useful if you are wishing to add custom select/where logic
   * to an ejected query. Please note that custom aliases will be applied to _relations only_,
   * and will not affect how the loader selects columns or embedded entities.
   *
   * @example
   * ```typescript
   * // Entity Class
   * @Entity()
   * class User extends BaseEntity {
   *
   *   @OneToOne()
   *   @JoinColumn()
   *   @ConfigureLoader({ sqlJoinAlias: "user_group", required: context => context.requireGroup })
   *   @Field(type => Group)
   *   group: Group;
   * }
   *
   * // Resolvers
   *
   * const resolvers = {
   *   Query: {
   *     userByGroupIdQuery (root, args, context, info) {
   *       return context.loader
   *         .loadEntity(User, 'user')
   *         .info(info)
   *         .context({ requireGroup: true })
   *         .ejectQueryBuilder(qb => qb.where("user_group.id = :groupId", { groupId: args.groupId }))
   *         .loadMany()
   *     }
   *   },
   * }
   * ```
   */
  sqlJoinAlias?: string;
}

/**
 * @hidden
 */
export type RequireOrIgnoreSettings = Map<
  string,
  boolean | FieldConfigurationPredicate | undefined
>;

export type EjectQueryCallback<T extends ObjectLiteral> = <
  T extends ObjectLiteral
>(
  qb: SelectQueryBuilder<T>
) => SelectQueryBuilder<T>;

/**
 * @hidden
 */
export interface QueryPredicates {
  andWhere: Array<WhereExpression>;
  orWhere: Array<WhereExpression>;
  search: Array<SearchOptions>;
  order: OrderByCondition;
  selectFields: Array<string>;
}

/**
 * @hidden
 */
export interface QueueItem {
  many: boolean;
  key: string;
  fields: GraphQLEntityFields | null;
  predicates: QueryPredicates;
  resolve: (value?: any) => any;
  reject: (reason: any) => void;
  entity: Function | string;
  pagination?: QueryPagination;
  alias?: string;
  context?: any;
  ejectQueryCallback: EjectQueryCallback<any>;
}

/**
 * @hidden
 */
export interface QueryMeta {
  key: string;
  fields: GraphQLEntityFields | null;
  found: boolean;
  item?: Promise<any>;
}

export interface GraphQLFieldArgs {
  [key: string]: any;
}

/**
 * An object containing the requested entity fields
 * and arguments for a graphql query
 */
export type GraphQLEntityFields = {
  [field: string]: {
    children: GraphQLEntityFields;
    arguments?: GraphQLFieldArgs;
  };
};
