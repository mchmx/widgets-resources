import { DefaultFilterEnum } from "../../typings/DatagridDateFilterProps";
import { FilterValue } from "./provider";

export declare type DefaultFilterValue = {
    type: DefaultFilterEnum;
    value: Date;
};

export function translateFilters(filters: FilterValue[]): DefaultFilterValue | undefined {
    if (filters && filters.length > 0) {
        if (filters.length === 1) {
            const [filter] = filters;
            let type: DefaultFilterEnum = "greater";
            switch (filter.type) {
                case ">":
                    type = "greater";
                    break;
                case ">=":
                    type = "greaterEqual";
                    break;
                case "<":
                    type = "smaller";
                    break;
                case "<=":
                    type = "smallerEqual";
                    break;
            }
            return {
                type,
                value: filter.value
            };
        } else {
            const [filterStart, filterEnd] = filters;
            let type: DefaultFilterEnum = "equal";
            if (filterStart.type === ">=" && filterEnd.type === "<") {
                type = "equal";
            } else if (filterStart.type === "<" && filterEnd.type === ">=") {
                type = "notEqual";
            }
            return {
                type,
                value: filterStart.value
            };
        }
    }
    return undefined;
}
