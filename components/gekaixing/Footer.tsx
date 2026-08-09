'use server'
import React from 'react'
import ToutiaoHot from './ToutiaoHot'
import SearchInput from './SearchInput'
import Ablout from './Ablout'
import FollowCard from './FollowCard'
import GkxAiSidebarServer from './GkxAiSidebarServer'
import ShowOnGkx from './ShowOnGkx'
import JobsFooterFilters from './JobsFooterFilters'
import PremiumCard from './PremiumCard'
import WhoToFollow from './WhoToFollow'

export default async function Footer() {
    return (
        <div className='space-y-4'>
            <JobsFooterFilters />
            <ShowOnGkx>
                <GkxAiSidebarServer></GkxAiSidebarServer>
            </ShowOnGkx>
            <div className="sticky top-0 z-10 -mt-4 bg-background/95 pb-4 pt-4 backdrop-blur">
                <SearchInput></SearchInput>
            </div>
            <PremiumCard />
            <ToutiaoHot></ToutiaoHot>
            <WhoToFollow />
            <FollowCard></FollowCard>
            <Ablout></Ablout>
        </div>
    )
}
