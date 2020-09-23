// import { isBehindRandomElement, unBlockElement } from "@mendix/pluggable-widgets-tools";
import {
    isBehindElement,
    isBehindRandomElement,
    isElementPartiallyOffScreen,
    isElementVisibleByUser,
    moveAbsoluteElementOnScreen,
    unBlockAbsoluteElement
} from "../../../tools/pluggable-widgets-tools/src/index";
import { ReactElement, useState, createElement, useCallback, RefObject, useEffect, useRef } from "react";
import { executeAction } from "@widgets-resources/piw-utils";
import { ActionValue } from "mendix";

import { PopupMenuContainerProps } from "../typings/PopupMenuProps";
import "./ui/PopupMenu.scss";

export default function PopupMenu(props: PopupMenuContainerProps): ReactElement {
    const ref = useRef<HTMLDivElement>(null);
    useOnClickOutside(ref, () => setVisibility(false));
    const [visibility, setVisibility] = useState(false);
    useEffect(() => {
        const element = (ref.current as HTMLDivElement).querySelector(".popupmenu-menu") as HTMLDivElement;
        element.style.display = visibility ? "flex" : "none";
        if (visibility) {
            correctPosition(element);
        }
    }, [visibility]);
    // Events
    const handleOnClickTrigger = useCallback((): void => {
        setVisibility(prev => !prev);
    }, [visibility, setVisibility]);
    const handleOnClickItem = useCallback(
        (itemAction?: ActionValue): void => {
            setVisibility(false);
            executeAction(itemAction);
        },
        [setVisibility]
    );
    const menuOptions = createMenuOptions(props, handleOnClickItem);
    // Properties
    const onHover =
        props.trigger === "onhover"
            ? {
                  onMouseEnter: handleOnClickTrigger,
                  onMouseLeave: handleOnClickTrigger
              }
            : {};
    const onClick =
        props.trigger === "onclick"
            ? {
                  onClick: handleOnClickTrigger
              }
            : {};

    return (
        <div ref={ref} className={"popupmenu " + props.class} {...onHover}>
            <div className={"popupmenu-trigger"} {...onClick}>
                {props.menuTrigger}
            </div>
            <div className={`popupmenu-menu popupmenu-position-${props.position}`} style={{ display: "none" }}>
                {menuOptions}
            </div>
        </div>
    );
}

function createMenuOptions(
    props: PopupMenuContainerProps,
    handleOnClickItem: (itemAction?: ActionValue) => void
): ReactElement[] {
    let menuOptions: ReactElement[];

    if (props.renderMode === "basic") {
        menuOptions = props.basicItems.map((item, index) => {
            const pickedStyle =
                item.styleClass !== "defaultStyle"
                    ? "popupmenu-basic-item-" + item.styleClass.replace("Style", "")
                    : "";
            return item.itemType === "divider" ? (
                <div key={index} className={"popupmenu-basic-divider"} />
            ) : (
                <div
                    key={index}
                    className={`popupmenu-basic-item ${pickedStyle}`}
                    onClick={() => {
                        handleOnClickItem(item.action);
                    }}
                >
                    {item.caption}
                </div>
            );
        });
    } else {
        menuOptions = props.customItems.map((item, index) => (
            <div key={index} className={"popupmenu-custom-item"} onClick={() => handleOnClickItem(item.action)}>
                {item.content}
            </div>
        ));
    }

    return menuOptions;
}

function useOnClickOutside(ref: RefObject<HTMLDivElement>, handler: () => void): void {
    useEffect(() => {
        const listener = (event: MouseEvent & { target: Node | null }): void => {
            if (!ref.current || ref.current.contains(event.target)) {
                return;
            }
            handler();
        };
        document.addEventListener("mousedown", listener);
        document.addEventListener("touchstart", listener);
        return () => {
            document.removeEventListener("mousedown", listener);
            document.removeEventListener("touchstart", listener);
        };
    }, [ref, handler]);
}

function correctPosition(element: HTMLElement): void {
    const isOffScreen = isElementPartiallyOffScreen(element);
    console.log(isOffScreen);
    if (isOffScreen) {
        moveAbsoluteElementOnScreen(element);
    }
    const boundingRect: DOMRect = element.getBoundingClientRect();
    const blockingElement = isBehindRandomElement(element, boundingRect, 3, "popupmenu");
    console.log(blockingElement);
    if (blockingElement && isElementVisibleByUser(blockingElement)) {
        unBlockAbsoluteElement(element, boundingRect, blockingElement.getBoundingClientRect());
    } else if (blockingElement) {
        let node = blockingElement;
        do {
            if (isBehindElement(element, node, 1) && isElementVisibleByUser(node)) {
                unBlockAbsoluteElement(element, boundingRect, node.getBoundingClientRect());
                return;
            } else {
                node = node.parentElement as HTMLElement;
            }
        } while (node.parentElement);
    }
}
