# Pamphlet

Pamphlet is an e-reader that makes it easier to have multiple novels on the go at once, maybe in different languages. Currently only supports ePub & five books open at a time.

UX is inspired by pamphlets, tourist guides, and I'll maybe a little bit by reels.

It's meant to feel like a big 2D book: you don't just turn pages left and right, but up and down too. Vertical navigation moves between contexts (i.e. individual books, your library, user settings.).

Horizontal navigation moves through a context (usually the pages of a book).

Dictionary lookups and word highlighting are supported.

One  unintuitive UI aspect I have to insist on, is that clicking on a book on your library _does not take you to that book_! It merely sets it to _open_. When a book open, it will have an icon next to its title indicating which row in the UI it occupies, and you can swipe vertically to that row to start swiping horizontally through the books pages.

The layout is something like this, you swipe between screens, or navigate with  <kbd>←</kbd><kbd>↓</kbd><kbd>↑</kbd><kbd>→</kbd>:

```
                                                                                   
                                                                                   
                                ┌───────────────┐                                  
                                │               │                                  
                                │               │                                  
                                │               │                                  
                                │   settings    │                                  
                                │               │                                  
           App opens here       │               │                                  
                │               │               │                                  
                │               │               │                                  
                └────────────┐  └──────┬────────┘                                  
                             └─────┐   │                                           
            ┌───────────────┐   ┌──┼───┴────────┐   ┌───────────────┐              
            │               │   │  │            │   │               │              
            │               │   │  ▀            │   │               │              
            │               │   │   library     │   │    library    │              
            │  upload book  │   │               │   │               │              
            │               ┼───┤               ┼───┤               │              
            │               │   │     (1)       │   │      (2)      │              
            │               │   │               │   │               │              
            │               │   │               │   │               │              
            └───────────────┘   └──────┬────────┘   └───────────────┘              
                                       │                                           
            ┌───────────────┐   ┌──────┴────────┐   ┌───────────────┐              
            │               │   │               │   │               │              
            │               │   │  current      │   │               │              
            │               │   │   page of     │   │               │              
            │   previous    │   │    book 1     │   │               │              
            │    page       ┼───┤               ┼───┤  next page    │              
            │               │   │               │   │               │              
            │               │   │               │   │               │              
            │               │   │               │   │               │              
            └───────────────┘   └──────┬────────┘   └───────────────┘              
                                       │                                           
            ┌───────────────┐   ┌──────┴────────┐                                  
            │               │   │               │                                  
            │               │   │  last, and    │                                  
            │   previous    │   │    current    │                                  
            │    page       │   │     page of   │                     ─            
            │               ┼───┤      book 2   │                                  
            │               │   │               │                                  
            │               │   │               │                                  
            │               │   │               │                                  
            └───────────────┘   └──────┬────────┘               ─                  
                                       │                                           
                                ┌──────┴────────┐   ┌───────────────┐              
                                │               │   │               │              
                                │               │   │               │              
                                │  first, and   │   │               │              
                                │    current    │   │   next page   │              
                                │     page of   ┼───┤               │              
                                │      book 3   │   │               │              
                                │               │   │               │              
                                │               │   │               │              
                                └───────────────┘   └───────────────┘
```      
                                                                                   
                                                                                   
                                                                                   
